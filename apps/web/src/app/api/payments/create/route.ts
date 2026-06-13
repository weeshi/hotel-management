import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { getPaymentGateway } from '@/lib/gateways';
import { withAuth } from '@/middleware/auth';
import { withValidation } from '@/middleware/validate';
import { errorResponse } from '@/lib/utils/api-response';
import { createPaymentSchema } from '@hotel/shared';

async function handler(request: NextRequest) {
  try {
    const body = (request as any).validatedBody;
    const user = (request as any).user;

    const booking = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      include: { folio: true },
    });

    if (!booking) {
      return errorResponse('الحجز غير موجود', 404);
    }

    const idempotencyKey = crypto.randomUUID();

    const gateway = getPaymentGateway(body.method.toLowerCase());

    const result = await gateway.createPaymentIntent({
      amount: body.amount,
      currency: body.currency,
      metadata: {
        bookingId: body.bookingId,
        userId: user.userId,
        description: `حجز #${booking.bookingNo}`,
      },
      idempotencyKey,
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId: body.bookingId,
        folioId: booking.folio?.id,
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        gateway: body.method.toLowerCase(),
        gatewayPaymentId: result.id,
        idempotencyKey,
        status: 'PENDING',
        metadata: JSON.stringify({ clientSecret: result.clientSecret }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        gatewayPaymentId: result.id,
        clientSecret: result.clientSecret,
        requiresAction: result.requiresAction,
        nextAction: result.nextAction,
        redirectUrl: result.redirectUrl,
        qrCode: result.qrCode,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الدفع', 400);
  }
}

export const POST = withAuth(withValidation(createPaymentSchema, handler));
