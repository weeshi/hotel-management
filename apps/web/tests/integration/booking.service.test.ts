import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { prisma } from '../helpers/db';
import { resetDb, seedTestData, closeDb } from '../helpers/db';

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
      const booking: any = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'ضيف تجريبي',
        adults: 1,
        children: 0,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-03T12:00:00Z',
        rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      });

      expect(booking.bookingNo).toMatch(/^BK-\d{6}-\d{4}$/);
      expect(booking.status).toBe('PENDING');
      expect(booking.guestName).toBe('ضيف تجريبي');
      expect(booking.rooms).toHaveLength(1);
      expect(booking.rooms[0].roomId).toBe(data.room101.id);
    });

    it('should create booking with multiple rooms', async () => {
      const booking: any = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'عائلة ضيف',
        adults: 3,
        children: 1,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-05T12:00:00Z',
        rooms: [
          { roomId: data.room101.id, nightlyRate: 200 },
          { roomId: data.room102.id, nightlyRate: 300 },
        ],
      });

      expect(booking.rooms).toHaveLength(2);
      expect(booking.adults).toBe(3);
      expect(booking.children).toBe(1);
    });

    it('should throw for unavailable room', async () => {
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

    it('should auto-confirm RECEPTION source bookings', async () => {
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

    it('should create booking with guest info', async () => {
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

    it('should handle same-day booking', async () => {
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

  describe('confirm', () => {
    it('should confirm a pending booking and mark rooms OCCUPIED', async () => {
      const booking = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'ضيف',
        adults: 1,
        children: 0,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-03T12:00:00Z',
        rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      });

      const confirmed = await bookingService.confirm(booking.id);
      expect(confirmed.status).toBe('CONFIRMED');

      const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
      expect(room?.status).toBe('OCCUPIED');
    });

    it('should throw for non-existent booking', async () => {
      await expect(
        bookingService.confirm('non-existent-id')
      ).rejects.toThrow('الحجز غير موجود');
    });
  });

  describe('checkIn', () => {
    it('should check in a confirmed booking and create folio', async () => {
      const booking = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'ضيف',
        adults: 1,
        children: 0,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-03T12:00:00Z',
        rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      });

      await bookingService.confirm(booking.id);
      const checkedIn = await bookingService.checkIn(booking.id);
      expect(checkedIn.status).toBe('CHECKED_IN');

      const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
      expect(folio).toBeDefined();
      expect(folio?.status).toBe('ACTIVE');
    });

    it('should throw for non-confirmed booking', async () => {
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
        bookingService.checkIn(booking.id)
      ).rejects.toThrow('يجب تأكيد الحجز أولاً');
    });
  });

  describe('checkOut', () => {
    it('should check out a checked-in guest', async () => {
      const booking = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'ضيف',
        adults: 1,
        children: 0,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-03T12:00:00Z',
        rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      });

      await bookingService.confirm(booking.id);
      await bookingService.checkIn(booking.id);
      const checkedOut = await bookingService.checkOut(booking.id, data.admin.id);

      expect(checkedOut.status).toBe('CHECKED_OUT');

      const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
      expect(room?.status).toBe('AVAILABLE');
      expect(room?.housekeepingStatus).toBe('DIRTY');

      const tasks = await prisma.housekeepingTask.findMany({
        where: { roomId: data.room101.id },
      });
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('should throw for non-checked-in booking', async () => {
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
        bookingService.checkOut(booking.id, data.admin.id)
      ).rejects.toThrow('الضيف ليس في إقامة نشطة');
    });
  });

  describe('cancel', () => {
    it('should cancel a booking and free the rooms', async () => {
      const booking = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'ضيف',
        adults: 1,
        children: 0,
        checkIn: '2026-07-01T14:00:00Z',
        checkOut: '2026-07-03T12:00:00Z',
        rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      });

      const cancelled = await bookingService.cancel(booking.id, 'تغيير في الخطط');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('تغيير في الخطط');

      const room = await prisma.room.findUnique({ where: { id: data.room101.id } });
      expect(room?.status).toBe('AVAILABLE');
    });

    it('should throw for non-existent booking', async () => {
      await expect(
        bookingService.cancel('non-existent-id')
      ).rejects.toThrow('الحجز غير موجود');
    });
  });
});
