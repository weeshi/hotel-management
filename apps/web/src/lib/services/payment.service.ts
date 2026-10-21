import { prisma, tenantTx } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { WalletService } from '@/lib/services/wallet.service';
import type { Role } from '@prisma/client';

const walletService = new WalletService();

export class PaymentService {

  async processRefund(paymentId: string, hotelId: string, data: {
    amount: number;
    reason?: string;
    createdById: string;
    userRole: Role;
  }) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, folio: { booking: { hotelId } } },
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

    const refund = await tenantTx(async (tx) => {
      const created = await tx.refund.create({
        data: {
          hotelId,
          paymentId,
          amount: data.amount,
          reason: data.reason,
          status: 'SUCCEEDED',
        },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedAmount: { increment: data.amount },
          status: newStatus,
        },
      });

      return created;
    });

    if (payment.folioId) {
      const folioId = payment.folioId;
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

      await tenantTx(async (tx) => {
        await tx.folioTransaction.create({
          data: {
            hotelId: payment.hotelId,
            folioId,
            type: 'REFUND',
            category: 'REFUND',
            description: data.reason || `استرداد من دفعة #${paymentId.slice(0, 8)}`,
            amount: data.amount,
            createdById: data.createdById,
          },
        });
        await tx.folio.update({
          where: { id: folioId },
          data: {
            totalPaid: { decrement: data.amount },
            balance: { increment: data.amount },
          },
        });
      });
    }

    return refund;
  }
}
