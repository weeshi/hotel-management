import { prisma } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { WalletService } from '@/lib/services/wallet.service';
import type { Role } from '@prisma/client';

const walletService = new WalletService();

export class PaymentService {

  async processRefund(paymentId: string, data: {
    amount: number;
    reason?: string;
    createdById: string;
    userRole: Role;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { folio: { include: { booking: true } } },
    });

    if (!payment) throw new NotFoundError('الدفعة غير موجودة');

    if (data.amount <= 0) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

    const maxRefund = payment.amount - payment.refundedAmount;
    if (data.amount > maxRefund) {
      throw new ValidationError('المبلغ المسترد يتجاوز المبلغ المتبقي من الدفعة');
    }

    const newRefundedAmount = payment.refundedAmount + data.amount;
    const newStatus = newRefundedAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const [refund] = await prisma.$transaction([
      prisma.refund.create({
        data: {
          paymentId,
          amount: data.amount,
          reason: data.reason,
          status: 'SUCCEEDED',
        },
      }),
      prisma.payment.update({
        where: { id: paymentId },
        data: {
          refundedAmount: { increment: data.amount },
          status: newStatus,
        },
      }),
    ]);

    if (payment.folioId) {
      if (payment.method === 'WALLET') {
        const booking = payment.folio?.booking;
        if (booking?.guestId && booking?.hotelId) {
          await walletService.deposit({
            guestId: booking.guestId,
            hotelId: booking.hotelId,
            amount: data.amount,
            description: data.reason || `استرداد من دفعة #${paymentId.slice(0, 8)}`,
            method: 'WALLET',
            createdById: data.createdById,
            userRole: data.userRole,
          });
        }
      }

      await prisma.$transaction([
        prisma.folioTransaction.create({
          data: {
            folioId: payment.folioId,
            type: 'REFUND',
            category: 'REFUND',
            description: data.reason || `استرداد من دفعة #${paymentId.slice(0, 8)}`,
            amount: data.amount,
            createdById: data.createdById,
          },
        }),
        prisma.folio.update({
          where: { id: payment.folioId },
          data: {
            totalPaid: { decrement: data.amount },
            balance: { increment: data.amount },
          },
        }),
      ]);
    }

    return refund;
  }
}
