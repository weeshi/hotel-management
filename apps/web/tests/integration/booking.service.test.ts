import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { prisma } from '../helpers/db';
import { resetDb, seedTestData, closeDb } from '../helpers/db';
import { asTenant } from '../helpers/tenant';

const bookingService = new BookingService();

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('BookingService', () => {
  describe('create', () => {
    it('should create a pending booking with rooms', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking: any = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف تجريبي',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200, hotelId: data.hotel.id }],
        });

        expect(booking.bookingNo).toMatch(/^BK-\d{6}-\d{4}$/);
        expect(booking.status).toBe('PENDING');
        expect(booking.guestName).toBe('ضيف تجريبي');
        expect(booking.rooms).toHaveLength(1);
        expect(booking.rooms[0].roomId).toBe(data.room101.id);
      });
    });

    it('should create booking with multiple rooms', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking: any = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'عائلة ضيف',
          adults: 3,
          children: 1,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-05T12:00:00Z',
          rooms: [
            { roomId: data.room101.id, nightlyRate: 200, hotelId: data.hotel.id },
            { roomId: data.room102.id, nightlyRate: 300, hotelId: data.hotel.id },
          ],
        });

        expect(booking.rooms).toHaveLength(2);
        expect(booking.adults).toBe(3);
        expect(booking.children).toBe(1);
      });
    });

    it('should throw for unavailable room', async () => {
      await asTenant(data.hotel.id, async () => {
        await prisma.room.update({
          where: { id: data.room101.id },
          data: { status: 'OCCUPIED' },
        });

        await expect(
          bookingService.create({
            hotelId: data.hotel.id,
            guestName: 'ضيف',
            adults: 1,
            children: 0,
            checkIn: '2026-07-01T14:00:00Z',
            checkOut: '2026-07-03T12:00:00Z',
            rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
          })
        ).rejects.toThrow('غير متاحة');
      });
    });

    it('should auto-confirm RECEPTION source bookings', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف استقبال',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
          source: 'RECEPTION',
        });

        expect(booking.status).toBe('CONFIRMED');
      });
    });

    it('should create booking with guest info', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'محمد',
          guestEmail: 'mohamed@example.com',
          guestPhone: '+218911234567',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        expect(booking.guestEmail).toBe('mohamed@example.com');
        expect(booking.guestPhone).toBe('+218911234567');
      });
    });

    it('should handle same-day booking', async () => {
      await asTenant(data.hotel.id, async () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف اليوم',
          adults: 1,
          children: 0,
          checkIn: today.toISOString(),
          checkOut: tomorrow.toISOString(),
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        expect(booking.status).toBe('PENDING');
      });
    });
  });

  describe('confirm', () => {
    it('should confirm a pending booking', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        const confirmed = await bookingService.confirm(booking.id, data.hotel.id);
        expect(confirmed.status).toBe('CONFIRMED');

        const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
        expect(room?.status).toBe('AVAILABLE');
      });
    });

    it('should throw for non-existent booking', async () => {
      await asTenant(data.hotel.id, async () => {
        await expect(
          bookingService.confirm('non-existent-id', data.hotel.id)
        ).rejects.toThrow('الحجز غير موجود');
      });
    });
  });

  describe('checkIn', () => {
    it('should check in a confirmed booking and create folio', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          source: 'RECEPTION',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        await bookingService.confirm(booking.id, data.hotel.id);
        const checkedIn = await bookingService.checkIn(booking.id, data.hotel.id);
        expect(checkedIn.status).toBe('CHECKED_IN');

        const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
        expect(folio).toBeDefined();
        expect(folio?.status).toBe('ACTIVE');
      });
    });

    it('should throw for non-confirmed booking', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        await expect(
          bookingService.checkIn(booking.id, data.hotel.id)
        ).rejects.toThrow('يجب تأكيد الحجز أولاً');
      });
    });
  });

  describe('checkOut', () => {
    it('should check out a checked-in guest with zero balance', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          source: 'RECEPTION',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        await bookingService.confirm(booking.id, data.hotel.id);
        await bookingService.checkIn(booking.id, data.hotel.id);

        // Pay off the balance so checkout succeeds (strict financial check)
        const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
        const balance = Number(folio!.balance);
        await prisma.$transaction([
          prisma.payment.create({
            data: { hotelId: data.hotel.id, folioId: folio!.id, amount: balance, method: 'CASH', status: 'SUCCEEDED' },
          }),
          prisma.folioTransaction.create({
            data: {
              folioId: folio!.id, type: 'PAYMENT', category: 'PAYMENT',
              description: 'تسديد كامل', amount: -balance,
            },
          }),
          prisma.folio.update({
            where: { id: folio!.id },
            data: { totalPaid: { increment: balance }, balance: { decrement: balance } },
          }),
        ]);

        const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);

        expect(checkedOut.booking.status).toBe('CHECKED_OUT');

        const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
        expect(room?.status).toBe('AVAILABLE');
        expect(room?.housekeepingStatus).toBe('DIRTY');

        const tasks = await prisma.housekeepingTask.findMany({
          where: { roomId: data.room101.id },
        });
        expect(tasks.length).toBeGreaterThan(0);
      });
    });

    it('should throw for non-checked-in booking', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        await expect(
          bookingService.checkOut(booking.id, data.hotel.id, data.admin.id)
        ).rejects.toThrow('النزيل ليس في إقامة نشطة');
      });
    });
  });

  describe('cancel', () => {
    it('should cancel a booking and free the rooms', async () => {
      await asTenant(data.hotel.id, async () => {
        const booking = await bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'ضيف',
          adults: 1,
          children: 0,
          checkIn: '2026-07-01T14:00:00Z',
          checkOut: '2026-07-03T12:00:00Z',
          rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
        });

        const cancelled = await bookingService.cancel(booking.id, data.hotel.id, 'تغيير في الخطط');
        expect(cancelled.status).toBe('CANCELLED');
        expect(cancelled.cancellationReason).toBe('تغيير في الخطط');

        const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
        expect(room?.status).toBe('AVAILABLE');
      });
    });

    it('should throw for non-existent booking', async () => {
      await asTenant(data.hotel.id, async () => {
        await expect(
          bookingService.cancel('non-existent-id', data.hotel.id)
        ).rejects.toThrow('الحجز غير موجود');
      });
    });
  });
});
