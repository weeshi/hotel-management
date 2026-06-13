import { prisma } from '@/lib/utils/prisma';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const folioRepo = new FolioRepository();

export class FolioService {
  async getFolioByBooking(bookingId: string) {
    return folioRepo.findByBookingId(bookingId);
  }

  async addCharge(folioId: string, data: {
    description: string;
    amount: number;
    category: string;
    createdById?: string;
  }) {
    const folio = await prisma.folio.findUnique({ where: { id: folioId } });
    if (!folio) throw new NotFoundError('Folio غير موجود');
    if (folio.status === 'SETTLED') {
      throw new ValidationError('لا يمكن إضافة رسوم على فاتورة مسددة');
    }

    return folioRepo.addTransaction(folioId, {
      type: 'CHARGE',
      category: data.category as 'ROOM_CHARGE' | 'SERVICE' | 'TAX' | 'DISCOUNT' | 'PAYMENT' | 'REFUND',
      description: data.description,
      amount: data.amount,
      createdById: data.createdById,
    });
  }

  async applyDiscount(folioId: string, data: {
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    reason?: string;
    createdById: string;
  }) {
    const folio = await prisma.folio.findUnique({ where: { id: folioId } });
    if (!folio) throw new NotFoundError('Folio غير موجود');

    const totalCharges = Number(folio.totalCharges);
    let discountAmount: number;

    if (data.type === 'PERCENTAGE') {
      if (data.value > 100) throw new ValidationError('الخصم لا يتجاوز 100%');
      discountAmount = (totalCharges * data.value) / 100;
    } else {
      discountAmount = data.value;
      if (discountAmount > totalCharges) {
        throw new ValidationError('الخصم لا يتجاوز إجمالي الفاتورة');
      }
    }

    await prisma.folioDiscount.create({
      data: {
        folioId,
        type: data.type,
        value: data.value,
        amount: discountAmount,
        reason: data.reason,
        createdById: data.createdById,
      },
    });

    return folioRepo.addTransaction(folioId, {
      type: 'DISCOUNT',
      category: 'DISCOUNT',
      description: data.reason || `خصم ${data.value}${data.type === 'PERCENTAGE' ? '%' : ' د.ل'}`,
      amount: -discountAmount,
      createdById: data.createdById,
    });
  }

  async processNightlyCharges() {
    const folios = await prisma.folio.findMany({
      where: {
        status: 'ACTIVE',
        scheduledCharges: {
          some: {
            processed: false,
            chargeDate: { lte: new Date() },
          },
        },
      },
      include: { booking: true },
    });

    for (const folio of folios) {
      await folioRepo.processScheduledCharges(folio.id);
    }

    return folios.length;
  }

  async getFolioSummary(folioId: string) {
    const folio = await prisma.folio.findUnique({
      where: { id: folioId },
      include: {
        transactions: { orderBy: { createdAt: 'asc' } },
        discounts: true,
        payments: { include: { refunds: true } },
        booking: {
          include: {
            rooms: { include: { room: true } },
            guest: true,
          },
        },
      },
    });

    if (!folio) throw new NotFoundError('Folio غير موجود');

    return {
      folioId: folio.id,
      status: folio.status,
      totalCharges: Number(folio.totalCharges),
      totalPaid: Number(folio.totalPaid),
      balance: Number(folio.balance),
      guest: folio.booking.guest || {
        name: folio.booking.guestName,
        email: folio.booking.guestEmail,
      },
      rooms: folio.booking.rooms.map((r) => ({
        number: r.room.roomNumber,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nightlyRate: r.nightlyRate,
      })),
      transactions: folio.transactions,
      discounts: folio.discounts,
      payments: folio.payments,
    };
  }
}
