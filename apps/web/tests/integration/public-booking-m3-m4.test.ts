import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { runWebBookingExpiryScan } from '@/lib/services/web-booking-expiry.service';
import { ConflictError, ValidationError } from '@/lib/utils/errors';
import {
  prisma,
  prismaRaw,
  resetDb,
  seedTestData,
  closeDb,
} from '../helpers/db';
import { asTenant } from '../helpers/tenant';

const bookingService = new BookingService();

let data: Awaited<ReturnType<typeof seedTestData>>;

const futureCheckIn = new Date(Date.now() + 5 * 86400000).toISOString();
const futureCheckOut = new Date(Date.now() + 7 * 86400000).toISOString();
const pastCheckIn = new Date(Date.now() - 1 * 86400000).toISOString();
const pastCheckOut = new Date(Date.now() + 1 * 86400000).toISOString();

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('M3 — atomic web quota lock', () => {
  it('serializes concurrent requests and rejects the oversell with 409', async () => {
    await prismaRaw.roomType.update({
      where: { id: data.singleType.id },
      data: { webRoomLimit: 1 },
    });

    const results = await asTenant(data.hotel.id, () =>
      Promise.allSettled([
        bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'سباق أ',
          adults: 1,
          children: 0,
          checkIn: futureCheckIn,
          checkOut: futureCheckOut,
          rooms: [{ roomTypeId: data.singleType.id }],
        }),
        bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'سباق ب',
          adults: 1,
          children: 0,
          checkIn: futureCheckIn,
          checkOut: futureCheckOut,
          rooms: [{ roomTypeId: data.singleType.id }],
        }),
      ]),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const bookings = await prismaRaw.booking.findMany({
      where: { hotelId: data.hotel.id },
    });
    expect(bookings).toHaveLength(1);
  });

  it('blocks a reception booking when every physical room is taken', async () => {
    await prismaRaw.roomType.update({
      where: { id: data.singleType.id },
      data: { webRoomLimit: 1 },
    });

    await asTenant(data.hotel.id, async () => {
      await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'حجز مؤكد',
        adults: 1,
        children: 0,
        checkIn: futureCheckIn,
        checkOut: futureCheckOut,
        rooms: [{ roomId: data.room101.id }],
        source: 'RECEPTION',
      });

      const occupied = await prismaRaw.booking.findFirst({
        where: { hotelId: data.hotel.id, source: 'RECEPTION' },
      });
      if (!occupied) throw new Error('seeded reception booking not found');

      await prismaRaw.booking.update({
        where: { id: occupied.id },
        data: { status: 'CONFIRMED' },
      });

      await expect(
        bookingService.create({
          hotelId: data.hotel.id,
          guestName: 'حجز زائد',
          adults: 1,
          children: 0,
          checkIn: futureCheckIn,
          checkOut: futureCheckOut,
          rooms: [{ roomTypeId: data.singleType.id }],
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe('M4 — physical room assignment & check-in guard', () => {
  it('requires an assigned room before check-in, then checks in successfully', async () => {
    await asTenant(data.hotel.id, async () => {
      const booking = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'نزيل ويب',
        adults: 1,
        children: 0,
        checkIn: pastCheckIn,
        checkOut: pastCheckOut,
        rooms: [{ roomTypeId: data.singleType.id }],
      });

      await bookingService.confirm(booking.id, data.hotel.id);

      await prismaRaw.folio.create({
        data: {
          hotelId: data.hotel.id,
          bookingId: booking.id,
          status: 'ACTIVE',
        },
      });

      await expect(
        bookingService.checkIn(booking.id, data.hotel.id),
      ).rejects.toBeInstanceOf(ValidationError);

      const bookingRoom = await prismaRaw.bookingRoom.findFirst({
        where: { bookingId: booking.id },
      });
      expect(bookingRoom?.roomId).toBeNull();

      const assigned = await bookingService.assignPhysicalRoom({
        bookingId: booking.id,
        hotelId: data.hotel.id,
        bookingRoomId: bookingRoom!.id,
        roomId: data.room101.id,
      });

      expect(assigned?.rooms[0].roomId).toBe(data.room101.id);
      expect(assigned?.status).toBe('CONFIRMED');

      const checkedIn = await bookingService.checkIn(booking.id, data.hotel.id);
      expect(checkedIn.status).toBe('CHECKED_IN');

      const room = await prismaRaw.room.findUnique({
        where: { id: data.room101.id },
      });
      expect(room?.status).toBe('OCCUPIED');

      const audit = await prismaRaw.auditLog.findFirst({
        where: { bookingId: booking.id, action: 'ASSIGN_ROOM' },
      });
      expect(audit).not.toBeNull();
    });
  });

  it('rejects assigning a room already reserved for the same nights', async () => {
    await asTenant(data.hotel.id, async () => {
      const first = await bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'الحجز الأول',
        adults: 1,
        children: 0,
        checkIn: futureCheckIn,
        checkOut: futureCheckOut,
        rooms: [{ roomId: data.room101.id }],
        source: 'RECEPTION',
      });
      await bookingService.confirm(first.id, data.hotel.id);

      const second = await prismaRaw.booking.create({
        data: {
          hotelId: data.hotel.id,
          bookingNo: 'BK-TEST-0001',
          guestName: 'الحجز الثاني',
          status: 'PENDING',
          source: 'WEBSITE',
          rooms: {
            create: {
              hotelId: data.hotel.id,
              roomTypeId: data.singleType.id,
              checkIn: new Date(futureCheckIn),
              checkOut: new Date(futureCheckOut),
              nightlyRate: 200,
            },
          },
        },
        include: { rooms: true },
      });
      const secondRoom = await prismaRaw.bookingRoom.findFirst({
        where: { bookingId: second.id },
      });

      await expect(
        bookingService.assignPhysicalRoom({
          bookingId: second.id,
          hotelId: data.hotel.id,
          bookingRoomId: secondRoom!.id,
          roomId: data.room101.id,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe('M4 — confirmationCutoffHours auto-expiry', () => {
  it('cancels only unconfirmed web bookings older than the cutoff', async () => {
    await prismaRaw.websiteSetting.create({
      data: { hotelId: data.hotel.id, confirmationCutoffHours: 24 },
    });

    const stale = await asTenant(data.hotel.id, () =>
      bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'حجز منتهي',
        adults: 1,
        children: 0,
        checkIn: futureCheckIn,
        checkOut: futureCheckOut,
        rooms: [{ roomTypeId: data.singleType.id }],
      }),
    );

    const fresh = await asTenant(data.hotel.id, () =>
      bookingService.create({
        hotelId: data.hotel.id,
        guestName: 'حجز حديث',
        adults: 1,
        children: 0,
        checkIn: futureCheckIn,
        checkOut: futureCheckOut,
        rooms: [{ roomTypeId: data.singleType.id }],
      }),
    );

    await prismaRaw.booking.update({
      where: { id: stale.id },
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });

    const result = await runWebBookingExpiryScan();
    expect(result.expiredBookings).toBe(1);

    const staleAfter = await prisma.booking.findFirst({
      where: { id: stale.id },
    });
    expect(staleAfter?.status).toBe('CANCELLED');

    const freshAfter = await prisma.booking.findFirst({
      where: { id: fresh.id },
    });
    expect(freshAfter?.status).toBe('PENDING');

    const audit = await prisma.auditLog.findFirst({
      where: { bookingId: stale.id, action: 'AUTO_EXPIRE_WEB_BOOKING' },
    });
    expect(audit).not.toBeNull();
  });
});
