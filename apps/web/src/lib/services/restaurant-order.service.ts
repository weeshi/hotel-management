import { prisma } from '@/lib/utils/prisma';
import { WalletService } from '@/lib/services/wallet.service';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { createAuditLog } from '@/lib/services/audit.service';
import type { Role } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

const walletService = new WalletService();
const folioRepo = new FolioRepository();

export class RestaurantOrderService {
  async settleOrder(orderId: string, data: {
    method: 'WALLET' | 'CASH' | 'POS';
    userId: string;
    userRole: Role;
    hotelId: string;
  }) {
    const order = await prisma.restaurantOrder.findUnique({
      where: { id: orderId },
      include: {
        booking: { include: { folio: true, guest: true } },
      },
    });

    if (!order) throw new NotFoundError('الطلب غير موجود');
    if (order.hotelId !== data.hotelId) throw new NotFoundError('الطلب غير موجود');
    if (order.status === 'PAID') throw new ValidationError('الطلب مدفوع بالفعل');

    if (data.method === 'WALLET' && !order.bookingId) {
      throw new ValidationError('Wallet payments are only available for registered hotel guests.');
    }

    const amount = Number(order.totalAmount);

    if (data.method === 'WALLET') {
      return this._settleWithWallet(order, amount, data);
    }

    return this._settleDirect(order, amount, { ...data, method: data.method as 'CASH' | 'POS' });
  }

  private async _settleWithWallet(
    order: any,
    amount: number,
    data: { userId: string; userRole: Role; hotelId: string },
  ) {
    const booking = order.booking;
    if (!booking?.folio) throw new ValidationError('الحجز ليس له فاتورة نشطة');
    if (booking.folio.status !== 'ACTIVE') throw new ValidationError('الفاتورة غير نشطة');
    if (!booking.guestId) throw new ValidationError('الحجز لا يحتوي على نزيل');

    const folio = booking.folio;
    const idempotencyKey = `restaurant_wallet_settle_${order.id}`;

    const existingCharge = await prisma.folioTransaction.findFirst({
      where: {
        folioId: folio.id,
        description: `طلب مطعم #${order.orderNo}`,
        type: 'CHARGE',
      },
    });

    if (!existingCharge) {
      await folioRepo.addTransaction(folio.id, {
        type: 'CHARGE',
        category: 'SERVICE',
        description: `طلب مطعم #${order.orderNo}`,
        amount,
      });
    }

    const walletTx = await walletService.withdraw({
      guestId: booking.guestId,
      hotelId: order.hotelId,
      amount,
      description: `تسوية طلب مطعم #${order.orderNo}`,
      method: 'WALLET',
      idempotencyKey,
      createdById: data.userId,
      userRole: data.userRole,
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        folioId: folio.id,
        amount,
        currency: 'LYD',
        method: 'WALLET',
        gateway: 'wallet',
        gatewayPaymentId: `wallet_${idempotencyKey}`,
        idempotencyKey,
        status: 'SUCCEEDED',
        metadata: JSON.stringify({
          walletTransactionId: walletTx.id,
          restaurantOrderId: order.id,
          orderNo: order.orderNo,
        }),
      },
    });

    await folioRepo.applyPayment(folio.id, payment.id, amount, data.userId);

    const updatedOrder = await prisma.restaurantOrder.update({
      where: { id: order.id },
      data: { status: 'PAID' },
    });

    createAuditLog({
      hotelId: order.hotelId,
      userId: data.userId,
      action: 'SETTLE',
      entity: 'RESTAURANT_ORDER',
      entityId: order.id,
      newValue: JSON.stringify({
        method: 'WALLET',
        amount,
        orderNo: order.orderNo,
        walletTransactionId: walletTx.id,
        paymentId: payment.id,
      }),
    });

    return updatedOrder;
  }

  private async _settleDirect(
    order: any,
    amount: number,
    data: { method: 'CASH' | 'POS'; userId: string; userRole: Role; hotelId: string },
  ) {
    const idempotencyKey = `restaurant_direct_settle_${order.id}`;

    const payment = await prisma.payment.create({
      data: {
        bookingId: order.bookingId || undefined,
        amount,
        currency: 'LYD',
        method: data.method,
        gateway: data.method.toLowerCase(),
        gatewayPaymentId: `${data.method.toLowerCase()}_${idempotencyKey}`,
        idempotencyKey,
        status: 'SUCCEEDED',
        metadata: JSON.stringify({
          restaurantOrderId: order.id,
          orderNo: order.orderNo,
        }),
      },
    });

    const updatedOrder = await prisma.restaurantOrder.update({
      where: { id: order.id },
      data: { status: 'PAID' },
    });

    createAuditLog({
      hotelId: order.hotelId,
      userId: data.userId,
      action: 'SETTLE',
      entity: 'RESTAURANT_ORDER',
      entityId: order.id,
      newValue: JSON.stringify({
        method: data.method,
        amount,
        orderNo: order.orderNo,
        paymentId: payment.id,
      }),
    });

    return updatedOrder;
  }
}
