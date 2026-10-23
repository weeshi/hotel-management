import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  GroupBookingService,
  GROUP_BOOKING_STATUSES,
  groupBookingStatusSchema,
} from '@/lib/services/group-booking.service';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { prismaRaw, resetDb, seedTestData, closeDb } from '../helpers/db';
import { asTenant } from '../helpers/tenant';

const groupBookingService = new GroupBookingService();
const folioRepo = new FolioRepository();

let data: Awaited<ReturnType<typeof seedTestData>>;

const BASE = new Date();
BASE.setHours(0, 0, 0, 0);

function daysFromBase(days: number): Date {
  return new Date(BASE.getTime() + days * 86400000);
}

interface MemberFixture {
  bookingId: string;
  bookingNo: string;
  folioId: string;
}

async function createMemberBooking(params: {
  bookingNo: string;
  guestName: string;
  status: string;
  groupBookingId: string;
  adults: number;
  children: number;
  roomId: string | null;
  roomTypeId: string;
  checkIn: Date;
  checkOut: Date;
}): Promise<MemberFixture> {
  const booking = await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: params.bookingNo,
      guestName: params.guestName,
      status: params.status,
      source: 'RECEPTION',
      adults: params.adults,
      children: params.children,
      groupBookingId: params.groupBookingId,
      rooms: {
        create: [
          {
            hotelId: data.hotel.id,
            roomId: params.roomId,
            roomTypeId: params.roomTypeId,
            nightlyRate: 200,
            checkIn: params.checkIn,
            checkOut: params.checkOut,
          },
        ],
      },
    },
  });

  const folio = await prismaRaw.folio.create({
    data: {
      hotelId: data.hotel.id,
      bookingId: booking.id,
      status: 'ACTIVE',
    },
  });

  return { bookingId: booking.id, bookingNo: params.bookingNo, folioId: folio.id };
}

async function addCharge(folioId: string, category: string, amount: number) {
  await folioRepo.addTransaction(folioId, {
    type: amount < 0 ? 'DISCOUNT' : 'CHARGE',
    category: category as 'ROOM_CHARGE' | 'SERVICE' | 'TAX' | 'DISCOUNT' | 'PAYMENT' | 'REFUND',
    description: 'test',
    amount,
  });
}

async function addPayment(params: {
  folioId: string;
  amount: number;
  method: string;
  status: string;
  refundedAmount?: number;
}) {
  await prismaRaw.payment.create({
    data: {
      hotelId: data.hotel.id,
      folioId: params.folioId,
      amount: params.amount,
      method: params.method,
      status: params.status,
      refundedAmount: params.refundedAmount || 0,
    },
  });
}

let groupId: string;
let masterFolioId: string;
let memberA: MemberFixture;
let memberB: MemberFixture;
let memberC: MemberFixture;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();

  const group = await groupBookingService.create({
    name: 'وفد شركة النور',
    hotelId: data.hotel.id,
    createdById: data.admin.id,
  });

  groupId = group.id;
  masterFolioId = group.masterFolioId ?? '';
  if (!masterFolioId) throw new Error('master folio missing');

  await prismaRaw.groupBooking.update({
    where: { id: groupId },
    data: {
      companyName: 'شركة النور',
      contactName: 'سالم',
      contactPhone: '0910000000',
      contactEmail: 'ops@alnoor.ly',
      checkIn: daysFromBase(1),
      checkOut: daysFromBase(4),
      status: 'ACTIVE',
      notes: 'وفد رسمي',
    },
  });

  memberA = await createMemberBooking({
    bookingNo: 'GRP-A-001',
    guestName: 'أحمد',
    status: 'CONFIRMED',
    groupBookingId: groupId,
    adults: 2,
    children: 1,
    roomId: data.room101.id,
    roomTypeId: data.singleType.id,
    checkIn: daysFromBase(1),
    checkOut: daysFromBase(3),
  });

  memberB = await createMemberBooking({
    bookingNo: 'GRP-B-002',
    guestName: 'بدر',
    status: 'PENDING',
    groupBookingId: groupId,
    adults: 1,
    children: 0,
    roomId: null,
    roomTypeId: data.singleType.id,
    checkIn: daysFromBase(1),
    checkOut: daysFromBase(4),
  });

  memberC = await createMemberBooking({
    bookingNo: 'GRP-C-003',
    guestName: 'خالد',
    status: 'CANCELLED',
    groupBookingId: groupId,
    adults: 1,
    children: 0,
    roomId: data.room102.id,
    roomTypeId: data.doubleType.id,
    checkIn: daysFromBase(1),
    checkOut: daysFromBase(3),
  });

  // Master folio: ROOM_CHARGE 1000 + SERVICE 200 - DISCOUNT 100 => charges 1100
  await addCharge(masterFolioId, 'ROOM_CHARGE', 1000);
  await addCharge(masterFolioId, 'SERVICE', 200);
  await addCharge(masterFolioId, 'DISCOUNT', -100);

  // Member A sub-folio: ROOM_CHARGE 300 + SERVICE 50 => charges 350
  await addCharge(memberA.folioId, 'ROOM_CHARGE', 300);
  await addCharge(memberA.folioId, 'SERVICE', 50);

  // Payments: master CASH 500 + CARD 200 (refund 50 => net 150) + PENDING 999 excluded
  await addPayment({ folioId: masterFolioId, amount: 500, method: 'CASH', status: 'SUCCEEDED' });
  await addPayment({ folioId: masterFolioId, amount: 200, method: 'CARD', status: 'SUCCEEDED', refundedAmount: 50 });
  await addPayment({ folioId: masterFolioId, amount: 999, method: 'CASH', status: 'PENDING' });

  // Member A payments: CASH 100 + MOBICASH 50
  await addPayment({ folioId: memberA.folioId, amount: 100, method: 'CASH', status: 'SUCCEEDED' });
  await addPayment({ folioId: memberA.folioId, amount: 50, method: 'MOBICASH', status: 'SUCCEEDED' });

  await prismaRaw.folio.update({
    where: { id: masterFolioId },
    data: { totalPaid: 650, balance: 450 },
  });
  await prismaRaw.folio.update({
    where: { id: memberA.folioId },
    data: { totalPaid: 150, balance: 200 },
  });
});

afterAll(async () => {
  await closeDb();
});

describe('Group Booking consolidated report — occupancy', () => {
  it('computes occupancy metrics across active member bookings', async () => {
    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);

    expect(report.occupancySummary.totalBookings).toBe(2);
    expect(report.occupancySummary.cancelledBookings).toBe(1);
    expect(report.occupancySummary.totalRooms).toBe(2);
    expect(report.occupancySummary.assignedRooms).toBe(1);
    expect(report.occupancySummary.unassignedRooms).toBe(1);
    expect(report.occupancySummary.totalRoomNights).toBe(5);
    expect(report.occupancySummary.totalGuests).toEqual({ adults: 3, children: 1 });

    expect(report.occupancySummary.statusBreakdown.CONFIRMED).toBe(1);
    expect(report.occupancySummary.statusBreakdown.PENDING).toBe(1);
    expect(report.occupancySummary.statusBreakdown.CANCELLED).toBe(1);
    expect(report.occupancySummary.statusBreakdown.CHECKED_IN).toBe(0);

    expect(report.group.companyName).toBe('شركة النور');
    expect(report.group.contactPhone).toBe('0910000000');
    expect(report.group.notes).toBe('وفد رسمي');
  });

  it('builds a member breakdown with per-booking room and folio figures', async () => {
    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);

    expect(report.memberBreakdown).toHaveLength(3);

    const a = report.memberBreakdown.find((m) => m.bookingNo === 'GRP-A-001');
    expect(a?.roomNumbers).toEqual(['101']);
    expect(a?.unassignedCount).toBe(0);
    expect(a?.nights).toBe(2);
    expect(a?.folioId).toBe(memberA.folioId);
    expect(a?.totalCharges).toBe(350);
    expect(a?.totalPaid).toBe(150);
    expect(a?.balance).toBe(200);

    const b = report.memberBreakdown.find((m) => m.bookingNo === 'GRP-B-002');
    expect(b?.roomNumbers).toEqual([]);
    expect(b?.unassignedCount).toBe(1);
    expect(b?.nights).toBe(3);

    const c = report.memberBreakdown.find((m) => m.bookingNo === 'GRP-C-003');
    expect(c?.status).toBe('CANCELLED');
    expect(c?.nights).toBe(2);
  });
});

describe('Group Booking consolidated report — financials', () => {
  it('consolidates master + sub folio charges, payments and balances', async () => {
    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);
    const financial = report.financialSummary;

    expect(financial.masterFolio?.totalCharges).toBe(1100);
    expect(financial.masterFolio?.totalPaid).toBe(650);
    expect(financial.masterFolio?.balance).toBe(450);

    expect(financial.subFoliosTotals.totalCharges).toBe(350);
    expect(financial.subFoliosTotals.totalPaid).toBe(150);
    expect(financial.subFoliosTotals.balance).toBe(200);

    expect(financial.consolidatedTotals.totalCharges).toBe(1450);
    expect(financial.consolidatedTotals.totalPaid).toBe(800);
    expect(financial.consolidatedTotals.balance).toBe(650);
  });

  it('breaks charges down by category with master/sub split', async () => {
    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);
    const categories = report.financialSummary.chargesByCategory;

    expect(categories.ROOM_CHARGE).toEqual({
      masterAmount: 1000,
      subFoliosAmount: 300,
      totalAmount: 1300,
    });
    expect(categories.SERVICE).toEqual({
      masterAmount: 200,
      subFoliosAmount: 50,
      totalAmount: 250,
    });
    expect(categories.DISCOUNT).toEqual({
      masterAmount: -100,
      subFoliosAmount: 0,
      totalAmount: -100,
    });
  });

  it('aggregates succeeded payments net of refunds by method', async () => {
    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);
    const methods = report.financialSummary.paymentsByMethod;

    expect(methods.CASH).toEqual({ masterAmount: 500, subFoliosAmount: 100, totalAmount: 600 });
    expect(methods.CARD).toEqual({ masterAmount: 150, subFoliosAmount: 0, totalAmount: 150 });
    expect(methods.MOBICASH).toEqual({ masterAmount: 0, subFoliosAmount: 50, totalAmount: 50 });
    expect(methods.PENDING).toBeUndefined();
  });

  it('lists routing rules', async () => {
    await prismaRaw.folioRoutingRule.create({
      data: {
        hotelId: data.hotel.id,
        groupBookingId: groupId,
        chargeType: 'SERVICE',
        targetFolioId: masterFolioId,
      },
    });

    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);
    expect(report.routingRules).toHaveLength(1);
    expect(report.routingRules[0].chargeType).toBe('SERVICE');
  });

  it('excludes voided/cancelled zero-activity sub-folios but preserves non-voided penalties', async () => {
    // memberC is CANCELLED with a zero-activity folio. Void it and stamp a stale
    // charge on it: it must NOT skew the consolidated financials.
    await addCharge(memberC.folioId, 'ROOM_CHARGE', 999);
    await prismaRaw.folio.update({
      where: { id: memberC.folioId },
      data: { status: 'VOID', totalCharges: 999, balance: 999 },
    });

    // A cancelled booking with a real (non-voided) cancellation penalty must survive.
    const penalty = await createMemberBooking({
      bookingNo: 'GRP-D-004',
      guestName: 'ليلى',
      status: 'CANCELLED',
      groupBookingId: groupId,
      adults: 1,
      children: 0,
      roomId: null,
      roomTypeId: data.singleType.id,
      checkIn: daysFromBase(1),
      checkOut: daysFromBase(2),
    });
    await addCharge(penalty.folioId, 'ROOM_CHARGE', 75);
    await prismaRaw.folio.update({
      where: { id: penalty.folioId },
      data: { totalCharges: 75, balance: 75 },
    });

    // Another cancelled booking with a non-voided, zero-activity folio: excluded too.
    await createMemberBooking({
      bookingNo: 'GRP-E-005',
      guestName: 'منى',
      status: 'CANCELLED',
      groupBookingId: groupId,
      adults: 1,
      children: 0,
      roomId: null,
      roomTypeId: data.singleType.id,
      checkIn: daysFromBase(1),
      checkOut: daysFromBase(2),
    });

    const report = await groupBookingService.getGroupReport(groupId, data.hotel.id);
    const financial = report.financialSummary;

    // Only memberA (350 / paid 150 / bal 200) + penalty (75 / 0 / 75) remain.
    expect(financial.subFoliosTotals.totalCharges).toBe(425);
    expect(financial.subFoliosTotals.totalPaid).toBe(150);
    expect(financial.subFoliosTotals.balance).toBe(275);

    // The voided 999 charge never leaks into any category bucket.
    expect(financial.chargesByCategory.ROOM_CHARGE).toEqual({
      masterAmount: 1000,
      subFoliosAmount: 375,
      totalAmount: 1375,
    });
    expect(financial.consolidatedTotals.totalCharges).toBe(1525);
  });
});

describe('Group Booking report — status lifecycle guard', () => {
  it('exposes only the canonical lifecycle statuses', () => {
    expect(GROUP_BOOKING_STATUSES).toEqual(['ACTIVE', 'COMPLETED', 'CANCELLED']);
    expect(groupBookingStatusSchema.safeParse('ACTIVE').success).toBe(true);
    expect(groupBookingStatusSchema.safeParse('COMPLETED').success).toBe(true);
    expect(groupBookingStatusSchema.safeParse('CANCELLED').success).toBe(true);
    expect(groupBookingStatusSchema.safeParse('ARCHIVED').success).toBe(false);
    expect(groupBookingStatusSchema.safeParse('active').success).toBe(false);
  });

  it('rejects an empty group name on create', async () => {
    await expect(
      groupBookingService.create({ name: '   ', hotelId: data.hotel.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('persists a provided lifecycle status on create', async () => {
    const group = await groupBookingService.create({
      name: 'وفد مغلق',
      hotelId: data.hotel.id,
      status: 'COMPLETED',
    });
    expect(group?.status).toBe('COMPLETED');
  });
});

describe('Group Booking consolidated report — tenant isolation', () => {
  it('throws NotFoundError when the group belongs to another hotel', async () => {
    await expect(
      asTenant(data.hotel.id, () => groupBookingService.getGroupReport(groupId, 'other-hotel')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
