import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withValidation } from '@/middlewares/validate';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse } from '@/lib/utils/api-response';
import { createPaymentSchema } from '@hotel/shared';
import { createAuditLog, createNotification } from '@/lib/services';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { WalletService } from '@/lib/services/wallet.service';

const WALLET_METHOD = 'WALLET';
const folioRepo = new FolioRepository();
const walletService = new WalletService();

async function handler(request: NextRequest) {
  try {
    const body = (request as any).validatedBody;
    const user = (request as any).user;

    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, hotelId: user.hotelId },
      include: { folio: true },
    });

    if (!booking) {
      return errorResponse('الحجز غير موجود', 404);
    }

    const idempotencyKey = crypto.randomUUID();
    const hotelId = user.hotelId;

    if (body.method === WALLET_METHOD) {
      if (!booking.guestId) {
        return errorResponse('الحجز لا يحتوي على ضيف لاستخدام المحفظة', 400);
      }

      const wallet = await walletService.withdraw({
        guestId: booking.guestId,
        hotelId,
        amount: body.amount,
        description: `دفع فاتورة حجز #${booking.bookingNo}`,
        method: 'WALLET',
        createdById: user.userId,
        idempotencyKey,
        userRole: user.role,
      });

      const payment = await prisma.payment.create({
        data: {
          hotelId,
          bookingId: body.bookingId,
          folioId: booking.folio?.id,
          amount: body.amount,
          currency: body.currency,
          method: 'WALLET',
          gateway: 'wallet',
          gatewayPaymentId: `wallet_${idempotencyKey}`,
          idempotencyKey,
          status: 'SUCCEEDED',
          metadata: JSON.stringify({ walletTransactionId: wallet.id }),
        },
      });

      if (booking.folio?.id) {
        await folioRepo.applyPayment(booking.folio.id, payment.id, body.amount, user.userId);
      }

      createAuditLog({
        hotelId,
        userId: user.userId,
        action: 'PAYMENT',
        entity: 'PAYMENT',
        entityId: payment.id,
        newValue: JSON.stringify({ amount: payment.amount, method: 'WALLET', status: 'SUCCEEDED' }),
      });

      return NextResponse.json({
        success: true,
        data: {
          paymentId: payment.id,
          status: 'SUCCEEDED',
        },
      });
    }

    // Manual confirmed payment for every other method (CASH, CARD, MOBICASH,
    // SADAD, STRIPE, ...). Front desk visually verifies bank/MobiCash-app
    // transfers and logs them (Decoupled PMS Ledger — no outbound gateway calls).
    const gateway = body.method.toLowerCase();
    const payment = await prisma.payment.create({
      data: {
        hotelId,
        bookingId: body.bookingId,
        folioId: booking.folio?.id,
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        gateway,
        externalRef: body.externalRef,
        gatewayPaymentId: `${gateway}_${idempotencyKey}`,
        idempotencyKey,
        status: 'SUCCEEDED',
        metadata: JSON.stringify({ capturedBy: user.userId, externalRef: body.externalRef || undefined }),
      },
    });

    if (booking.folio?.id) {
      await folioRepo.applyPayment(booking.folio.id, payment.id, body.amount, user.userId);
    }

    createAuditLog({
      hotelId,
      userId: user.userId,
      action: 'PAYMENT',
      entity: 'PAYMENT',
      entityId: payment.id,
      newValue: JSON.stringify({ amount: payment.amount, method: payment.method, status: 'SUCCEEDED' }),
    });

    createNotification({
      hotelId,
      bookingId: booking.id,
      type: 'PAYMENT',
      event: 'payment.received',
      recipient: 'RECEPTION',
      subject: `دفعة مستلمة #${booking.bookingNo}`,
      body: `${payment.amount} ${payment.currency} - ${payment.method}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: 'SUCCEEDED',
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الدفع', error.statusCode || 400);
  }
}

export const POST = withAuth(
  withCsrf(withRateLimit(withValidation(createPaymentSchema, handler))),
  ['ADMIN', 'MANAGER', 'RECEPTION']
);
