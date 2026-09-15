import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { getGatewayAdapter, isGatewaySupported, CreatePaymentSessionRequest } from '@/lib/integrations/gateways';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

const paymentSessionRateLimit = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string, limit = 5, windowMs = 60000): { allowed: boolean } {
  const now = Date.now();
  const record = paymentSessionRateLimit.get(key);

  if (!record || now > record.resetTime) {
    paymentSessionRateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  if (record.count >= limit) {
    return { allowed: false };
  }

  record.count++;
  return { allowed: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `payment-session:${bookingId}:${ip}`;
  const rateLimitResult = checkRateLimit(rateLimitKey);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'طلبات كثيرة جداً لإنشاء جلسة دفع. حاول بعد دقيقة', code: 'RATE_LIMITED' },
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { gateway, returnUrl } = body as { gateway?: string; returnUrl?: string };

    if (!gateway || !isGatewaySupported(gateway)) {
      return errorResponse('بوابة دفع غير محددة أو غير مدعومة', 400, 'INVALID_GATEWAY');
    }

    if (!returnUrl) {
      return errorResponse('رابط العودة (returnUrl) مطلوب', 400, 'MISSING_RETURN_URL');
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
      include: {
        folio: true,
        guest: true,
        hotel: true,
      },
    });

    if (!booking) {
      return errorResponse('الحجز غير موجود', 404);
    }

    if (!booking.folio) {
      return errorResponse('هذا الحجز لا يحتوي على فاتورة (Folio) للدفع', 400, 'NO_FOLIO');
    }

    const balance = Number(booking.folio.balance);
    if (balance <= 0) {
      return errorResponse('الرصيد المستحق صفر أو سالب — لا حاجة لدفعة', 400, 'NO_BALANCE_DUE');
    }

    const adapter = getGatewayAdapter(gateway);
    const config = adapter.config;

    const merchantTxId = `pay_${bookingId}_${Date.now()}`;
    const amount = balance;
    const currency = booking.hotel.currency || 'LYD';

    const gatewayRequest: CreatePaymentSessionRequest = {
      amount,
      currency,
      orderId: merchantTxId,
      customerName: booking.guestName || booking.guest?.name || 'ضيف',
      customerEmail: booking.guestEmail || booking.guest?.email || '',
      customerPhone: (booking.guestPhone ?? booking.guest?.phone ?? undefined) as string | undefined,
      description: `دفعة حجز #${booking.bookingNo} — ${booking.hotel.name}`,
      returnUrl,
      callbackUrl: config.callbackUrl,
    };

    const gatewayResult = await adapter.createPaymentSession(gatewayRequest);

    if (!gatewayResult.success) {
      console.error(`[${gateway.toUpperCase()}] Create session failed:`, gatewayResult.error);
      return errorResponse(`فشل إنشاء جلسة الدفع: ${gatewayResult.error}`, 502);
    }

    const paymentSession = await prisma.paymentSession.create({
      data: {
        hotelId: booking.hotelId,
        bookingId: booking.id,
        folioId: booking.folio.id,
        guestId: booking.guestId ?? undefined,
        method: gateway.toUpperCase(),
        gateway,
        amount,
        currency,
        status: 'PENDING',
        merchantTxId,
        gatewayTransactionId: gatewayResult.sessionId ?? gatewayResult.transactionId,
        returnUrl,
        idempotencyKey: merchantTxId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return successResponse({
      paymentSessionId: paymentSession.id,
      paymentUrl: gatewayResult.paymentUrl,
      gatewayTransactionId: gatewayResult.transactionId ?? gatewayResult.sessionId,
      amount,
      currency,
      expiresAt: paymentSession.expiresAt?.toISOString(),
    }, 201);
  } catch (err: any) {
    console.error('[Payment Session] Unexpected error:', err);
    return errorResponse(err.message || 'فشل إنشاء جلسة الدفع', 500);
  }
}