import { prisma } from '@/lib/utils/prisma';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { BookingRepository } from '@/lib/repositories/booking.repository';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const bookingRepo = new BookingRepository();
const folioRepo = new FolioRepository();

export class BookingService {
  async create(data: {
    hotelId: string;
    guestId?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    adults: number;
    children: number;
    checkIn: string;
    checkOut: string;
    rooms: Array<{
      roomId: string;
      ratePlanId?: string;
      nightlyRate: number;
    }>;
    services?: Array<{ serviceId: string; quantity: number }>;
    source?: string;
  }) {
    // التحقق من توفر الغرف
    for (const roomData of data.rooms) {
      const room = await prisma.room.findUnique({
        where: { id: roomData.roomId },
        include: { roomType: true },
      });

      if (!room) throw new NotFoundError(`الغرفة غير موجودة`);
      if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
        throw new ValidationError(`الغرفة ${room.roomNumber} غير متاحة`);
      }
    }

    const bookingNo = await generateBookingNumber(data.hotelId);

    // إنشاء الحجز مع الغرف
    const booking = await prisma.booking.create({
      data: {
        bookingNo,
        hotelId: data.hotelId,
        guestId: data.guestId,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestPhone: data.guestPhone,
        adults: data.adults,
        children: data.children,
        source: (data.source as any) || 'WEBSITE',
        status: 'PENDING',
        rooms: {
          create: data.rooms.map((r) => ({
            roomId: r.roomId,
            ratePlanId: r.ratePlanId,
            nightlyRate: r.nightlyRate,
            checkIn: new Date(data.checkIn),
            checkOut: new Date(data.checkOut),
          })),
        },
      },
      include: {
        rooms: {
          include: { room: true },
        },
      },
    });

    // إضافة الخدمات إن وجدت
    if (data.services && data.services.length > 0) {
      for (const svc of data.services) {
        const service = await prisma.service.findUnique({
          where: { id: svc.serviceId },
        });
        if (service) {
          await prisma.bookingService.create({
            data: {
              bookingId: booking.id,
              serviceId: svc.serviceId,
              quantity: svc.quantity,
              price: service.price * svc.quantity,
            },
          });
        }
      }
    }

    // تأكيد الحجز تلقائياً للحجوزات من مكتب الاستقبال
    if (data.source === 'RECEPTION') {
      await this.confirm(booking.id);
    }

    return booking;
  }

  async confirm(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' },
    });

    // تحديث حالة الغرف
    for (const room of booking.rooms) {
      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'OCCUPIED' },
      });
    }

    return updated;
  }

  async checkIn(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CONFIRMED') {
      throw new ValidationError('يجب تأكيد الحجز أولاً');
    }

    // إنشاء Folio للحجز
    const folio = await prisma.folio.create({
      data: {
        bookingId,
        totalCharges: 0,
        totalPaid: 0,
        balance: 0,
      },
    });

    // إنشاء الشحنات المجدولة
    await folioRepo.createScheduledCharges(folio.id, bookingId);

    return prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN' },
    });
  }

  async checkOut(bookingId: string, settledById: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: true,
        folio: {
          include: { scheduledCharges: true },
        },
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') {
      throw new ValidationError('الضيف ليس في إقامة نشطة');
    }

    // ترحيل الشحنات المعلقة
    if (booking.folio) {
      await folioRepo.processScheduledCharges(booking.folio.id);
      await folioRepo.settleFolio(booking.folio.id, settledById);
    }

    // تحديث حالة الغرف إلى متسخة
    for (const room of booking.rooms) {
      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
      });

      // إنشاء مهمة تنظيف
      await prisma.housekeepingTask.create({
        data: {
          hotelId: booking.hotelId,
          roomId: room.roomId,
          taskType: 'CLEANING',
          priority: 'NORMAL',
          status: 'PENDING',
        },
      });
    }

    return prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_OUT' },
    });
  }

  async cancel(bookingId: string, reason?: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    // إعادة الغرف للحالة متاحة
    for (const room of booking.rooms) {
      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'AVAILABLE' },
      });
    }

    return updated;
  }
}
