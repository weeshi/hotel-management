import { prisma, tenantTx } from '@/lib/utils/prisma';
import { BaseRepository } from './base.repository';

export class FolioRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.folio as any);
  }

  async findByBookingId(bookingId: string, hotelId?: string) {
    return prisma.folio.findFirst({
      where: { bookingId, ...(hotelId ? { booking: { hotelId } } : {}) },
      include: {
        transactions: {
          include: { createdBy: true },
          orderBy: { createdAt: 'asc' },
        },
        payments: true,
        discounts: true,
        scheduledCharges: {
          where: { processed: false },
          orderBy: { chargeDate: 'asc' },
        },
      },
    });
  }

  async addTransaction(folioId: string, data: {
    type: 'CHARGE' | 'PAYMENT' | 'REFUND' | 'DISCOUNT';
    category: 'ROOM_CHARGE' | 'SERVICE' | 'TAX' | 'DISCOUNT' | 'PAYMENT' | 'REFUND';
    description: string;
    amount: number;
    taxAmount?: number;
    createdById?: string;
    roomChargeId?: string;
  }) {
    const isCharge = data.amount > 0;
    const transaction = await tenantTx(async (tx) => {
      const created = await tx.folioTransaction.create({
        data: {
          folioId,
          type: data.type,
          category: data.category,
          description: data.description,
          amount: data.amount,
          taxAmount: data.taxAmount || 0,
          createdById: data.createdById,
          roomChargeId: data.roomChargeId,
        },
      });
      await tx.folio.update({
        where: { id: folioId },
        data: {
          totalCharges: { increment: data.amount + (data.taxAmount || 0) },
          balance: { increment: data.amount + (data.taxAmount || 0) },
          ...(isCharge ? { status: 'ACTIVE', settledAt: null, settledById: null } : {}),
        },
      });

      return created;
    });

    return transaction;
  }

  async applyPayment(folioId: string, paymentId: string, amount: number, settledById?: string) {
    const { transaction, updatedFolio } = await tenantTx(async (tx) => {
      const created = await tx.folioTransaction.create({
        data: {
          folioId,
          type: 'PAYMENT',
          category: 'PAYMENT',
          description: 'دفعة',
          amount: -amount,
        },
      });
      const updated = await tx.folio.update({
        where: { id: folioId },
        data: {
          totalPaid: { increment: amount },
          balance: { decrement: amount },
        },
      });
      return { transaction: created, updatedFolio: updated };
    });

    if (Number(updatedFolio.balance) <= 0 && updatedFolio.status !== 'SETTLED') {
      await prisma.folio.update({
        where: { id: folioId },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          settledById,
        },
      });
    }

    return transaction;
  }

  async settleFolio(folioId: string, settledById: string) {
    return prisma.folio.update({
      where: { id: folioId },
      data: {
        status: 'SETTLED',
        settledAt: new Date(),
        settledById,
      },
    });
  }

  async createScheduledCharges(folioId: string, bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: {
          include: { room: { include: { roomType: true } } },
        },
      },
    });

    if (!booking) throw new Error('Booking not found');

    const charges = [];
    for (const room of booking.rooms) {
      const nights = Math.ceil(
        (room.checkOut.getTime() - room.checkIn.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      for (let i = 0; i < nights; i++) {
        const chargeDate = new Date(room.checkIn);
        chargeDate.setDate(chargeDate.getDate() + i);

charges.push({
            hotelId: booking.hotelId,
            folioId,
            description: `إيجار ${room.room?.roomNumber ?? 'غير محدد'} - ${chargeDate.toLocaleDateString('ar-LY')}`,
            amount: room.nightlyRate,
            chargeDate,
          });
      }
    }

    if (charges.length > 0) {
      await prisma.scheduledCharge.createMany({ data: charges });
    }

    return charges;
  }

  async processScheduledCharges(folioId: string) {
    const pending = await prisma.scheduledCharge.findMany({
      where: {
        folioId,
        processed: false,
        chargeDate: { lte: new Date() },
      },
    });

    for (const charge of pending) {
      await this.addTransaction(folioId, {
        type: 'CHARGE',
        category: 'ROOM_CHARGE',
        description: charge.description,
        amount: Number(charge.amount),
      });

      await prisma.scheduledCharge.update({
        where: { id: charge.id },
        data: { processed: true, processedAt: new Date() },
      });
    }

    return pending;
  }
}
