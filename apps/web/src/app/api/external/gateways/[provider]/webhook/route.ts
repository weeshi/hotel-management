import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { getGatewayAdapter, isGatewaySupported } from '@/lib/integrations/gateways';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';
import { decryptSecret } from '@/lib/utils/crypto';

const GATEWAY_ALLOWED_IPS: Record<string, string[]> = {
  plutu: (process.env.PLUTU_WEBHOOK_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
  tlync: (process.env.TLYNC_WEBHOOK_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
};

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

function isIpAllowed(provider: string, clientIp: string): boolean {
  const allowedIps = GATEWAY_ALLOWED_IPS[provider] || [];
  if (allowedIps.length === 0) {
    if (process.env.DANGER_BYPASS_WEBHOOK_IP_CHECK === 'true') {
      console.warn(`[${provider.toUpperCase()} Webhook] IP whitelist empty — bypassed via DANGER_BYPASS_WEBHOOK_IP_CHECK`);
      return true;
    }
    console.error(`[${provider.toUpperCase()} Webhook] IP whitelist not configured and bypass not enabled — rejecting`);
    return false;
  }
  return allowedIps.some(allowed => {
    if (allowed.includes('/')) {
      const [base, prefix] = allowed.split('/');
      const prefixLen = parseInt(prefix, 10);
      const mask = ~0 << (32 - prefixLen);
      const ipNum = clientIp.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
      const baseNum = base.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
      return (ipNum & mask) === (baseNum & mask);
    }
    return allowed === clientIp;
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isGatewaySupported(provider)) {
    return errorResponse(`بوابة غير مدعومة: ${provider}`, 400, 'UNSUPPORTED_GATEWAY');
  }

  const clientIp = getClientIp(request);
  if (!isIpAllowed(provider, clientIp)) {
    console.warn(`[${provider.toUpperCase()} Webhook] IP rejected: ${clientIp}`);
    return errorResponse('عنوان IP غير مسموح', 403, 'IP_NOT_ALLOWED');
  }

  const adapter = getGatewayAdapter(provider);

  const rawBody = await request.text();

  const webhookParse = adapter.parseWebhook(rawBody);
  if (!webhookParse.ok || !webhookParse.data) {
    console.warn(`[${provider.toUpperCase()} Webhook] Parse failed: ${webhookParse.error}`);
    return errorResponse('تنسيق البيانات غير صالح', 400);
  }

  const payload = webhookParse.data;

  const transactionId = 'transaction_id' in payload ? (payload as any).transaction_id : (payload as any).tran_id;
  const orderId = 'order_id' in payload ? (payload as any).order_id : (payload as any).order_id;

  let hotelId: string | null = null;
  let paymentSession: {
    id: string;
    hotelId: string;
    bookingId: string;
    folioId: string | null;
    gatewayConfig: string | null;
    method: string;
    gateway: string;
  } | null = null;

  try {
    paymentSession = await prisma.paymentSession.findFirst({
      where: {
        OR: [
          { gatewayTransactionId: transactionId },
          { merchantTxId: orderId },
        ],
        gateway: provider,
      },
      include: { booking: true, folio: true, hotel: true },
    });

    if (paymentSession) {
      hotelId = paymentSession.hotelId;
    }
  } catch (err: any) {
    console.error(`[${provider.toUpperCase()} Webhook] DB lookup failed:`, err.message);
    return errorResponse('فشل البحث عن جلسة الدفع', 500);
  }

  if (!hotelId || !paymentSession) {
    console.warn(`[${provider.toUpperCase()} Webhook] No matching PaymentSession found`, { transactionId, orderId });
    return successResponse({ received: true, matched: false });
  }

  let secretKey = '';
  if (paymentSession.gatewayConfig) {
    try {
      const decrypted = decryptSecret(paymentSession.gatewayConfig);
      const storedConfig = JSON.parse(decrypted);
      secretKey = storedConfig.secretKey || '';
    } catch (err) {
      console.warn(`[${provider.toUpperCase()} Webhook] Failed to decrypt gatewayConfig: ${err instanceof Error ? err.message : 'unknown'}`);
      secretKey = '';
    }
  }
  if (!secretKey) {
    const config = adapter.config;
    secretKey = 'secretKey' in config ? config.secretKey : (config as any).secretKey || '';
  }
  if (!secretKey) {
    console.error(`[${provider.toUpperCase()} Webhook] Secret key not configured`);
    return errorResponse('إعداد البوابة غير مكتمل', 500);
  }

  const validSignature = adapter.verifyWebhookSignature(payload, secretKey);
  if (!validSignature) {
    console.warn(`[${provider.toUpperCase()} Webhook] Invalid signature`, { provider, transactionId, clientIp });
    return errorResponse('توقيع غير صالح', 401, 'UNAUTHORIZED');
  }

  const status = (payload as any).status;
  const isSuccess = status === 'SUCCESS';

  const webhookRecord = await prisma.gatewayWebhook.create({
    data: {
      provider,
      hotelId,
      eventId: transactionId,
      type: `payment.${status.toLowerCase()}`,
      payload: rawBody,
      status: 'RECEIVED',
    },
  }).catch(async (err: any) => {
    if (err.code === 'P2002') {
      return { duplicate: true } as any;
    }
    throw err;
  });

  if (webhookRecord && 'duplicate' in webhookRecord) {
    return successResponse({ received: true, duplicate: true });
  }

  if (!isSuccess) {
    await prisma.paymentSession.update({
      where: { id: paymentSession!.id },
      data: { status: 'FAILED' },
    });

    await prisma.gatewayWebhook.update({
      where: { id: webhookRecord.id },
      data: { status: 'PROCESSED', paymentSessionId: paymentSession!.id },
    });

    return successResponse({ received: true, status: 'failed' });
  }

  const amount = (payload as any).amount;
  const currency = (payload as any).currency || 'LYD';

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        hotelId,
        bookingId: paymentSession!.bookingId,
        folioId: paymentSession!.folioId ?? undefined,
        amount,
        currency,
        method: paymentSession!.method.toUpperCase(),
        gateway: provider,
        gatewayPaymentId: transactionId,
        externalRef: orderId,
        idempotencyKey: `gw_${hotelId}_${transactionId}`,
        status: 'SUCCEEDED',
        metadata: JSON.stringify({ paymentSessionId: paymentSession!.id, webhookId: webhookRecord.id }),
      },
    });

    await tx.paymentSession.update({
      where: { id: paymentSession!.id },
      data: { status: 'SUCCEEDED', paymentId: payment.id, gatewayTransactionId: transactionId, gatewayReference: orderId },
    });

    if (paymentSession!.folioId) {
      const folioTx = await tx.folioTransaction.create({
        data: {
          folioId: paymentSession!.folioId,
          type: 'PAYMENT',
          category: 'PAYMENT',
          description: `دفعة إلكترونية (${provider})`,
          amount: -amount,
        },
      });

      const updatedFolio = await tx.folio.update({
        where: { id: paymentSession!.folioId },
        data: {
          totalPaid: { increment: amount },
          balance: { decrement: amount },
        },
      });

      if (Number(updatedFolio.balance) <= 0 && updatedFolio.status !== 'SETTLED') {
        await tx.folio.update({
          where: { id: paymentSession!.folioId },
          data: {
            status: 'SETTLED',
            settledAt: new Date(),
          },
        });
      }
    }

    await createAuditLog({
      hotelId,
      userId: 'SYSTEM_WEBHOOK',
      action: 'PAYMENT',
      entity: 'PAYMENT',
      entityId: payment.id,
      newValue: JSON.stringify({ amount, method: payment.method, gateway: provider, status: 'SUCCEEDED' }),
      ip: 'webhook',
      userAgent: provider,
    });

    return { paymentId: payment.id, paymentSessionId: paymentSession!.id };
  });

  await prisma.gatewayWebhook.update({
    where: { id: webhookRecord.id },
    data: { status: 'PROCESSED', paymentId: result.paymentId, paymentSessionId: result.paymentSessionId },
  });

  return successResponse({ received: true, paymentId: result.paymentId, status: 'succeeded' });
}