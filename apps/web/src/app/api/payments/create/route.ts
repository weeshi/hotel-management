import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { getPaymentGateway } from '@/lib/gateways';
import { withAuth } from '@/middlewares/auth';
import { withValidation } from '@/middlewares/validate';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse } from '@/lib/utils/api-response';
import { createPaymentSchema } from '@hotel/shared';
import { createAuditLog, createNotification } from '@/lib/services';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { WalletService } from '@/lib/services/wallet.service';

const DIRECT_METHODS = ['CASH', 'CARD'];
const WALLET_METHOD = 'WALLET';
const folioRepo = new FolioRepository();
const walletService = new WalletService();

async function handler(request: NextRequest) {
  try {
    const body = (request as any).validatedBody;
    const user = (request as any).user;

    const booking = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      include: { folio: true },
    });

    if (!booking) {
      return errorResponse('ط§ظ„ط­ط¬ط² ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);
    }

    const idempotencyKey = crypto.randomUUID();

    if (DIRECT_METHODS.includes(body.method)) {
      const payment = await prisma.payment.create({
        data: {
          bookingId: body.bookingId,
          folioId: booking.folio?.id,
          amount: body.amount,
          currency: body.currency,
          method: body.method,
          gateway: 'cash',
          gatewayPaymentId: `cash_${idempotencyKey}`,
          idempotencyKey,
          status: 'SUCCEEDED',
          metadata: JSON.stringify({ capturedBy: user.userId }),
        },
      });

      if (booking.folio?.id) {
        await folioRepo.applyPayment(booking.folio.id, payment.id, body.amount, user.userId);
      }

      createAuditLog({
        hotelId: booking.hotelId,
        userId: user.userId,
        action: 'PAYMENT',
        entity: 'PAYMENT',
        entityId: payment.id,
        newValue: JSON.stringify({ amount: payment.amount, method: payment.method, status: 'SUCCEEDED' }),
      });

      createNotification({
        hotelId: booking.hotelId,
        bookingId: booking.id,
        type: 'PAYMENT',
        event: 'payment.received',
        recipient: 'RECEPTION',
        subject: `ط¯ظپط¹ط© ظ…ط³طھظ„ظ…ط© #${booking.bookingNo}`,
        body: `${payment.amount} ${payment.currency} - ${payment.method}`,
      });

      return NextResponse.json({
        success: true,
        data: {
          paymentId: payment.id,
          status: 'SUCCEEDED',
        },
      });
    }

    if (body.method === WALLET_METHOD) {
      if (!booking.guestId) {
        return errorResponse('ط§ظ„ط­ط¬ط² ظ„ط§ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ط¶ظٹظپ ظ„ط§ط³طھط®ط¯ط§ظ… ط§ظ„ظ…ط­ظپط¸ط©', 400);
      }

      const wallet = await walletService.withdraw({
        guestId: booking.guestId,
        hotelId: booking.hotelId,
        amount: body.amount,
        description: `ط¯ظپط¹ ظپط§طھظˆط±ط© ط­ط¬ط² #${booking.bookingNo}`,
        method: 'WALLET',
        createdById: user.userId,
        idempotencyKey,
        userRole: user.role,
      });

      const payment = await prisma.payment.create({
        data: {
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
        hotelId: booking.hotelId,
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

    const gateway = getPaymentGateway(body.method.toLowerCase());

    const result = await gateway.createPaymentIntent({
      amount: body.amount,
      currency: body.currency,
      metadata: {
        bookingId: body.bookingId,
        userId: user.userId,
        description: `ط­ط¬ط² #${booking.bookingNo}`,
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
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط¯ظپط¹', 400);
  }
}

export const POST = withAuth(withCsrf(withValidation(createPaymentSchema, handler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
