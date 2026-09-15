import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/utils/prisma';
import { getGatewayAdapter, isGatewaySupported } from '@/lib/integrations/gateways';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

const folioRepo = new FolioRepository();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isGatewaySupported(provider)) {
    return errorResponse(`بوابة غير مدعومة: ${provider}`, 400, 'UNSUPPORTED_GATEWAY');
  }

  const adapter = getGatewayAdapter(provider);
  const config = adapter.config;

  const rawBody = await request.text();
  const signatureHeader = headers().get('x-signature') || headers().get('x-plutu-signature') || headers().get('x-tlync-signature') || '';

  const webhookParse = adapter.parseWebhook(rawBody);
  if (!webhookParse.ok || !webhookParse.data) {
    console.warn(`[${provider.toUpperCase()} Webhook] Parse failed: ${webhookParse.error}`);
    return errorResponse('تنسيق البيانات غير صالح', 400);
  }

  const payload = webhookParse.data;
  const secretKey = 'secretKey' in config ? config.secretKey : (config as any).secretKey;
  if (!secretKey) {
    console.error(`[${provider.toUpperCase()} Webhook] Secret key not configured`);
    return errorResponse('إعداد البوابة غير مكتمل', 500);
  }

  const validSignature = adapter.verifyWebhookSignature(payload, secretKey);
  if (!validSignature) {
    console.warn(`[${provider.toUpperCase()} Webhook] Invalid signature`, { provider, transactionId: 'transaction_id' in payload ? (payload as any).transaction_id : (payload as any).tran_id });
    return errorResponse('توقيع غير صالح', 401);
  }

  const transactionId = 'transaction_id' in payload ? (payload as any).transaction_id : (payload as any).tran_id;
  const orderId = 'order_id' in payload ? (payload as any).order_id : (payload as any).order_id;

  const status = (payload as any).status;
  const isSuccess = status === 'SUCCESS';

  let hotelId: string | null = null;
  let paymentSession = null;

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

  if (!hotelId) {
    console.warn(`[${provider.toUpperCase()} Webhook] No matching PaymentSession found`, { transactionId, orderId });
    return successResponse({ received: true, matched: false });
  }

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
      await folioRepo.applyPayment(paymentSession!.folioId, payment.id, amount, 'SYSTEM_WEBHOOK');
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