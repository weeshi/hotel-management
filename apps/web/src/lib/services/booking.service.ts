import { prisma } from '@/lib/utils/prisma';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { BookingRepository } from '@/lib/repositories/booking.repository';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { PricingService } from '@/lib/services/pricing.service';
import { GuestService } from '@/lib/services/guest.service';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const bookingRepo = new BookingRepository();
const folioRepo = new FolioRepository();
const pricingService = new PricingService();

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
      nightlyRate?: number;
    }>;
    services?: Array<{ serviceId: string; quantity: number }>;
    source?: string;
    cancellationPolicyId?: string;
  }) {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);

    if (nights < 1) throw new ValidationError('مدة الإقامة يجب أن تكون ليلة واحدة على الأقل');

    const bookingRooms: Array<{
      roomId: string;
      ratePlanId?: string;
      nightlyRate: number;
      checkIn: Date;
      checkOut: Date;
    }> = [];

    let cancellationPolicyId = data.cancellationPolicyId;

    for (const roomData of data.rooms) {
      const room = await prisma.room.findUnique({
        where: { id: roomData.roomId },
        include: { roomType: true },
      });
      if (!room) throw new NotFoundError(`الغرفة غير موجودة`);
      if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
        throw new ValidationError(`الغرفة ${room.roomNumber} غير متاحة`);
      }

      let nightlyRate = roomData.nightlyRate;
      let ratePlanId = roomData.ratePlanId;

      if (!nightlyRate || !ratePlanId) {
        const ratePlan = await pricingService.findBestRatePlan(
          room.roomTypeId, room.id, checkInDate, checkOutDate,
        );

        if (ratePlan) {
          if (ratePlan.minStay > nights) {
            throw new ValidationError(
              `خطة السعر "${ratePlan.ratePlanId}" تتطلب ${ratePlan.minStay} ليالٍ كحد أدنى`,
            );
          }
          nightlyRate = ratePlan.nightlyRate;
          ratePlanId = ratePlan.ratePlanId;
          if (ratePlan.cancellationPolicyId) {
            cancellationPolicyId = ratePlan.cancellationPolicyId;
          }
        } else {
          nightlyRate = room.roomType.baseRate;
        }
      }

      bookingRooms.push({
        roomId: roomData.roomId,
        ratePlanId,
        nightlyRate: nightlyRate || room.roomType.baseRate,
        checkIn: checkInDate,
        checkOut: checkOutDate,
      });
    }

    if (!data.guestId && data.guestName) {
      const guestService = new GuestService();
      const guest = await guestService.findOrCreateFromBooking({
        name: data.guestName,
        email: data.guestEmail,
        phone: data.guestPhone,
      });
      data.guestId = guest.id;
    }

    const bookingNo = await generateBookingNumber(data.hotelId);
    const isReception = data.source === 'RECEPTION';

    // Resolve services with their prices before the transaction
    const servicesWithPrice: Array<{ serviceId: string; quantity: number; price: number }> = [];
    if (data.services && data.services.length > 0) {
      for (const svc of data.services) {
        const service = await prisma.service.findUnique({ where: { id: svc.serviceId } });
        if (service) {
          servicesWithPrice.push({ ...svc, price: service.price * svc.quantity });
        }
      }
    }

    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
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
          cancellationPolicyId: cancellationPolicyId || undefined,
          rooms: {
            create: bookingRooms.map((r) => ({
              roomId: r.roomId,
              ratePlanId: r.ratePlanId,
              nightlyRate: r.nightlyRate,
              checkIn: r.checkIn,
              checkOut: r.checkOut,
            })),
          },
        },
        include: { rooms: { include: { room: true } } },
      });

      // Create folio if reception booking
      if (isReception) {
        const folio = await tx.folio.create({
          data: {
            bookingId: created.id,
            totalCharges: 0,
            totalPaid: 0,
            balance: 0,
          },
        });

        // Add service charges as folio transactions
        for (const svc of servicesWithPrice) {
          const service = await tx.service.findUnique({ where: { id: svc.serviceId } });
          if (service) {
            await tx.bookingService.create({
              data: {
                bookingId: created.id,
                serviceId: svc.serviceId,
                quantity: svc.quantity,
                price: svc.price,
              },
            });
            await tx.folioTransaction.create({
              data: {
                folioId: folio.id,
                type: 'CHARGE',
                category: 'SERVICE',
                description: `${service.nameAr || service.name} x${svc.quantity}`,
                amount: svc.price,
              },
            });
            await tx.folio.update({
              where: { id: folio.id },
              data: {
                totalCharges: { increment: svc.price },
                balance: { increment: svc.price },
              },
            });
          }
        }
      } else {
        // For non-reception bookings, just create BookingService records
        for (const svc of servicesWithPrice) {
          await tx.bookingService.create({
            data: {
              bookingId: created.id,
              serviceId: svc.serviceId,
              quantity: svc.quantity,
              price: svc.price,
            },
          });
        }
      }

      if (isReception) {
        return tx.booking.update({
          where: { id: created.id },
          data: { status: 'CONFIRMED' },
        });
      }

      return created;
    });

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

    return updated;
  }

  async checkIn(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: { include: { room: true } } },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CONFIRMED') {
      throw new ValidationError('يجب تأكيد الحجز أولاً');
    }

    const earliestCheckIn = booking.rooms.reduce(
      (earliest, r) => (r.checkIn < earliest ? r.checkIn : earliest),
      booking.rooms[0].checkIn,
    );
    if (new Date() < earliestCheckIn) {
      throw new ValidationError(
        'لا يمكن تسجيل الدخول قبل تاريخ الوصول المحدد. قم بتعديل الحجز لتغيير تاريخ البداية',
      );
    }

    const folio = await prisma.folio.create({
      data: {
        bookingId,
        totalCharges: 0,
        totalPaid: 0,
        balance: 0,
      },
    });

    for (const room of booking.rooms) {
      const nights = Math.ceil(
        (room.checkOut.getTime() - room.checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );
      await folioRepo.addTransaction(folio.id, {
        type: 'CHARGE',
        category: 'ROOM_CHARGE',
        description: `إيجار ${room.room.roomNumber} - ${nights} ليالٍ`,
        amount: Number(room.nightlyRate) * nights,
      });

      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'OCCUPIED' },
      });
    }

    const pendingServices = await prisma.bookingService.findMany({
      where: { bookingId },
      include: { service: true },
    });
    for (const bs of pendingServices) {
      await folioRepo.addTransaction(folio.id, {
        type: 'CHARGE',
        category: 'SERVICE',
        description: `خدمة: ${bs.service.nameAr || bs.service.name} x${bs.quantity}`,
        amount: bs.price,
      });
    }

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
        folio: true,
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') {
      throw new ValidationError('النزيل ليس في إقامة نشطة');
    }

    if (booking.folio) {
      await folioRepo.settleFolio(booking.folio.id, settledById);
    }

    for (const room of booking.rooms) {
      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
      });

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

    const wasCheckedIn = booking.status === 'CHECKED_IN';

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    for (const room of booking.rooms) {
      if (wasCheckedIn) {
        await prisma.room.update({
          where: { id: room.roomId },
          data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
        });

        await prisma.housekeepingTask.create({
          data: {
            hotelId: booking.hotelId,
            roomId: room.roomId,
            taskType: 'CLEANING',
            priority: 'NORMAL',
            status: 'PENDING',
          },
        });
      } else {
        await prisma.room.update({
          where: { id: room.roomId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    return updated;
  }

  async calculateRefund(bookingId: string, cancelledAt: Date = new Date()) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: true,
        cancellationPolicy: true,
        folio: true,
      },
    });
    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (!booking.cancellationPolicy) return { refundAmount: 0, refundPercentage: 0, canRefund: false };

    const checkInDate = booking.rooms[0]?.checkIn || new Date();
    const hoursBeforeCheckIn = (checkInDate.getTime() - cancelledAt.getTime()) / 3600000;
    const totalAmount = booking.folio ? Number(booking.folio.totalCharges) : 0;

    return pricingService.calculateCancellationRefund(
      booking.cancellationPolicy.rules,
      totalAmount,
      Math.max(0, hoursBeforeCheckIn),
    );
  }
}
