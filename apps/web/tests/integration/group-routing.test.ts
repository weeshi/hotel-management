import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { FolioService } from '@/lib/services/folio.service';
import { prisma } from '../helpers/db';
import { resetDb, seedTestData, closeDb } from '../helpers/db';

const bookingService = new BookingService();
const groupBookingService = new GroupBookingService();
const folioService = new FolioService();

let data: Awaited<ReturnType<typeof seedTestData>>;
let booking: any;
let bookingFolioId: string;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();

  booking = await bookingService.create({
    hotelId: data.hotel.id,
    guestName: 'ضيف مجموعة',
    adults: 1, children: 0,
    checkIn: '2026-07-01T14:00:00Z',
    checkOut: '2026-07-03T12:00:00Z',
    source: 'RECEPTION',
    rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
  });
  await bookingService.confirm(booking.id, data.hotel.id);
  await bookingService.checkIn(booking.id, data.hotel.id);

  const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
  if (!folio) throw new Error('Folio not found after check-in');
  bookingFolioId = folio.id;
});

afterAll(async () => {
  await closeDb();
});

describe('Group Booking Routing', () => {
  function assertGroup(group: unknown): asserts group is NonNullable<typeof group> {
    if (!group) throw new Error('Group is null');
  }

  it('getTargetFolio should respect routing rules', async () => {
    const group = await groupBookingService.create({
      name: 'مجموعة اختبار',
      hotelId: data.hotel.id,
      createdById: data.admin.id,
    });
    assertGroup(group);
    const mfId = group.masterFolioId!;

    await groupBookingService.assignBookings({
      groupId: group.id,
      hotelId: data.hotel.id,
      bookingIds: [booking.id],
      createdById: data.admin.id,
    });

    await groupBookingService.setRoutingRules(
      group.id,
      data.hotel.id,
      [
        { chargeType: 'ROOM_CHARGE', targetFolioId: mfId },
        { chargeType: 'RESTAURANT', targetFolioId: bookingFolioId },
      ],
      data.admin.id,
    );

    const roomChargeTarget = await groupBookingService.getTargetFolio(booking.id, 'ROOM_CHARGE', data.hotel.id);
    expect(roomChargeTarget).toBe(mfId);

    const restaurantTarget = await groupBookingService.getTargetFolio(booking.id, 'RESTAURANT', data.hotel.id);
    expect(restaurantTarget).toBe(bookingFolioId);

    const serviceTarget = await groupBookingService.getTargetFolio(booking.id, 'SERVICE', data.hotel.id);
    expect(serviceTarget).toBe(bookingFolioId);
  });

  it('should accumulate charges on correct folios per routing rules', async () => {
    const group = await groupBookingService.create({
      name: 'مجموعة شحن',
      hotelId: data.hotel.id,
      createdById: data.admin.id,
    });
    assertGroup(group);
    const mfId = group.masterFolioId!;

    await groupBookingService.assignBookings({
      groupId: group.id,
      hotelId: data.hotel.id,
      bookingIds: [booking.id],
      createdById: data.admin.id,
    });

    await groupBookingService.setRoutingRules(
      group.id,
      data.hotel.id,
      [
        { chargeType: 'ROOM_CHARGE', targetFolioId: mfId },
        { chargeType: 'RESTAURANT', targetFolioId: bookingFolioId },
      ],
      data.admin.id,
    );

    const masterFolio = await prisma.folio.findUnique({ where: { id: mfId } });
    const masterBalanceBefore = Number(masterFolio?.balance || 0);

    const bookingFolio = await prisma.folio.findUnique({ where: { id: bookingFolioId } });
    const bookingBalanceBefore = Number(bookingFolio?.balance || 0);

    await folioService.addCharge(mfId, data.hotel.id, {
      description: 'إيجار الغرفة للمجموعة',
      amount: 400,
      category: 'ROOM_CHARGE',
      createdById: data.admin.id,
    });

    await folioService.addCharge(bookingFolioId, data.hotel.id, {
      description: 'مطعم - وجبة عشاء',
      amount: 150,
      category: 'SERVICE',
      createdById: data.admin.id,
    });

    const masterAfter = await prisma.folio.findUnique({ where: { id: mfId } });
    expect(Number(masterAfter!.totalCharges)).toBe(masterBalanceBefore + 400);
    expect(Number(masterAfter!.balance)).toBe(masterBalanceBefore + 400);

    const bookingAfter = await prisma.folio.findUnique({ where: { id: bookingFolioId } });
    expect(Number(bookingAfter!.totalCharges)).toBe(bookingBalanceBefore + 150);
    expect(Number(bookingAfter!.balance)).toBe(bookingBalanceBefore + 150);
  });
});
