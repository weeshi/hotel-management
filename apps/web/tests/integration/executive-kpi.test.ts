import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  ExecutiveKpiService,
  parseTripoliWindow,
  getTripoliMonthToDateWindow,
  toTripoliDayIndex,
  tripoliDayStart,
} from '@/lib/services/executive-kpi.service';
import { FolioService } from '@/lib/services/folio.service';
import { PaymentService } from '@/lib/services/payment.service';
import { ValidationError } from '@/lib/utils/errors';
import { Role } from '@prisma/client';
import { prismaRaw, resetDb, seedTestData, closeDb } from '../helpers/db';
import { asTenant } from '../helpers/tenant';

const service = new ExecutiveKpiService();
const folioService = new FolioService();
const paymentService = new PaymentService();

let data: Awaited<ReturnType<typeof seedTestData>>;

const WINDOW_START = '2026-03-01';
const WINDOW_END = '2026-03-31';

function tripoliAt(dateTime: string): Date {
  return new Date(`${dateTime}+02:00`);
}

async function createBooking(params: {
  bookingNo: string;
  status: string;
  source?: string;
  createdAt?: Date;
}): Promise<string> {
  const booking = await prismaRaw.booking.create({
    data: {
      hotelId: data.hotel.id,
      bookingNo: params.bookingNo,
      guestName: 'Guest',
      status: params.status,
      source: params.source ?? 'RECEPTION',
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    },
  });
  return booking.id;
}

async function createBookingRoom(params: {
  bookingId: string;
  checkIn: Date;
  checkOut: Date;
  nightlyRate: number;
  roomId?: string | null;
}): Promise<void> {
  await prismaRaw.bookingRoom.create({
    data: {
      hotelId: data.hotel.id,
      bookingId: params.bookingId,
      roomId: params.roomId ?? null,
      nightlyRate: params.nightlyRate,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
    },
  });
}

async function createFolio(bookingId: string, status: string): Promise<string> {
  const folio = await prismaRaw.folio.create({
    data: { hotelId: data.hotel.id, bookingId, status },
  });
  return folio.id;
}

async function createLedgerEntry(params: {
  folioId: string;
  type: string;
  category: string;
  amount: number;
  createdAt: Date;
}): Promise<string> {
  const entry = await prismaRaw.folioTransaction.create({
    data: {
      hotelId: data.hotel.id,
      folioId: params.folioId,
      type: params.type,
      category: params.category,
      description: 'test',
      amount: params.amount,
      createdAt: params.createdAt,
    },
  });
  return entry.id;
}

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('Executive KPI — Tripoli half-open window (inclusive end date)', () => {
  it('anchors calendar dates to Tripoli midnight and includes the final day', () => {
    const window = parseTripoliWindow(WINDOW_START, WINDOW_END);
    expect(window.startBound.toISOString()).toBe('2026-02-28T22:00:00.000Z');
    expect(window.endBound.toISOString()).toBe('2026-03-31T22:00:00.000Z');
    expect(window.totalDays).toBe(31);
  });

  it('accepts a single-day window and rejects an inverted one', () => {
    expect(parseTripoliWindow('2026-03-05', '2026-03-05').totalDays).toBe(1);
    expect(() => parseTripoliWindow('2026-03-06', '2026-03-05')).toThrow(ValidationError);
  });

  it('exposes the normalized period in the report', async () => {
    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );
    expect(report.period.startBound).toBe('2026-02-28T22:00:00.000Z');
    expect(report.period.endBound).toBe('2026-03-31T22:00:00.000Z');
    expect(report.period.totalDays).toBe(31);
    expect(report.period.timezone).toBe('Africa/Tripoli');
  });
});

describe('Executive KPI — accrual room revenue', () => {
  it('clamps overlaps to the window and ignores the booking creation date', async () => {
    const bookingId = await createBooking({
      bookingNo: 'KPI-ACCRUAL-001',
      status: 'CHECKED_OUT',
      createdAt: new Date('2026-01-15T10:00:00.000Z'),
    });

    // Fully inside: 2026-03-05 -> 2026-03-10 = 5 nights @ 100
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-03-05T00:00:00.000'),
      checkOut: tripoliAt('2026-03-10T00:00:00.000'),
      nightlyRate: 100,
    });

    // Straddles the start boundary: only 2026-03-01 -> 2026-03-03 counts = 2 nights @ 200
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-02-27T00:00:00.000'),
      checkOut: tripoliAt('2026-03-03T00:00:00.000'),
      nightlyRate: 200,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.inventory.totalPhysicalRooms).toBe(2);
    expect(report.inventory.maintenanceRooms).toBe(0);
    expect(report.inventory.sellableRooms).toBe(2);
    expect(report.inventory.availableRoomNights).toBe(62);
    expect(report.inventory.occupiedRoomNights).toBe(7);
    expect(report.kpis.accruedRoomRevenue).toBe(900);
    expect(report.kpis.adr).toBe(128.57);
    expect(report.kpis.revPar).toBe(14.52);
    expect(report.kpis.occupancyRate).toBe(11.29);
    expect(report.kpis.isOverbooked).toBe(false);
  });

  it('excludes CONFIRMED bookings that have not arrived from actual accrual', async () => {
    const confirmedBooking = await createBooking({
      bookingNo: 'KPI-CONFIRMED-001',
      status: 'CONFIRMED',
    });
    await createBookingRoom({
      bookingId: confirmedBooking,
      checkIn: tripoliAt('2026-03-05T00:00:00.000'),
      checkOut: tripoliAt('2026-03-07T00:00:00.000'),
      nightlyRate: 500,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.inventory.occupiedRoomNights).toBe(0);
    expect(report.kpis.accruedRoomRevenue).toBe(0);
    expect(report.kpis.adr).toBe(0);
    expect(report.kpis.revPar).toBe(0);
  });

  it('counts non-midnight 14:00 -> 12:00 next day as exactly one night', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-PARTIAL-001', status: 'CHECKED_IN' });
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-03-01T14:00:00.000'),
      checkOut: tripoliAt('2026-03-02T12:00:00.000'),
      nightlyRate: 250,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: '2026-03-01',
        endDate: '2026-03-02',
      }),
    );

    expect(report.inventory.occupiedRoomNights).toBe(1);
    expect(report.kpis.accruedRoomRevenue).toBe(250);
  });
});

describe('Executive KPI — tax separation, voids & inclusive final day', () => {
  it('separates net revenue, tax and gross billed, and nets collections', async () => {
    const activeBooking = await createBooking({ bookingNo: 'KPI-TAX-001', status: 'CHECKED_IN' });
    const activeFolio = await createFolio(activeBooking, 'ACTIVE');

    const voidBooking = await createBooking({ bookingNo: 'KPI-TAX-002', status: 'CHECKED_OUT' });
    const voidFolio = await createFolio(voidBooking, 'VOID');

    await createLedgerEntry({
      folioId: activeFolio,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 1000,
      createdAt: tripoliAt('2026-03-10T10:00:00.000'),
    });
    await createLedgerEntry({
      folioId: activeFolio,
      type: 'CHARGE',
      category: 'RESTAURANT',
      amount: 200,
      createdAt: tripoliAt('2026-03-11T10:00:00.000'),
    });
    await createLedgerEntry({
      folioId: activeFolio,
      type: 'CHARGE',
      category: 'TAX',
      amount: 120,
      createdAt: tripoliAt('2026-03-11T10:00:00.000'),
    });
    await createLedgerEntry({
      folioId: activeFolio,
      type: 'DISCOUNT',
      category: 'DISCOUNT',
      amount: -50,
      createdAt: tripoliAt('2026-03-12T10:00:00.000'),
    });
    // Outside the half-open window -> excluded.
    await createLedgerEntry({
      folioId: activeFolio,
      type: 'CHARGE',
      category: 'SERVICE',
      amount: 999,
      createdAt: tripoliAt('2026-04-05T10:00:00.000'),
    });
    // Void folio -> excluded.
    await createLedgerEntry({
      folioId: voidFolio,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 777,
      createdAt: tripoliAt('2026-03-10T10:00:00.000'),
    });

    await prismaRaw.payment.createMany({
      data: [
        {
          hotelId: data.hotel.id,
          folioId: activeFolio,
          amount: 800,
          method: 'CASH',
          status: 'SUCCEEDED',
          refundedAmount: 50,
          createdAt: tripoliAt('2026-03-15T10:00:00.000'),
        },
        {
          hotelId: data.hotel.id,
          folioId: activeFolio,
          amount: 500,
          method: 'CARD',
          status: 'PENDING',
          createdAt: tripoliAt('2026-03-15T10:00:00.000'),
        },
        {
          hotelId: data.hotel.id,
          folioId: voidFolio,
          amount: 300,
          method: 'CASH',
          status: 'SUCCEEDED',
          createdAt: tripoliAt('2026-03-15T10:00:00.000'),
        },
      ],
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.kpis.netRevenue).toBe(1150);
    expect(report.kpis.taxTotal).toBe(120);
    expect(report.kpis.grossBilled).toBe(1270);
    expect(report.kpis.totalCollected).toBe(750);
    expect(report.kpis.collectionRate).toBe(59.06);
    expect(report.revenueByCategory.ROOM_CHARGE).toBe(1000);
    expect(report.revenueByCategory.RESTAURANT).toBe(200);
    expect(report.revenueByCategory.SERVICE).toBe(0);
    expect(report.revenueByCategory.TAX).toBe(120);
    expect(report.revenueByCategory.DISCOUNT).toBe(-50);
  });

  it('voiding an active CHARGE and TAX reverses net revenue, tax and category totals', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-VOID-001', status: 'CHECKED_IN' });
    const folioId = await createFolio(bookingId, 'ACTIVE');

    const now = new Date();
    const window = getTripoliMonthToDateWindow(now);

    const chargeId = await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 1000,
      createdAt: now,
    });
    const taxId = await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'TAX',
      amount: 120,
      createdAt: now,
    });

    const before = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    expect(before.kpis.netRevenue).toBe(1000);
    expect(before.kpis.taxTotal).toBe(120);
    expect(before.kpis.grossBilled).toBe(1120);
    expect(before.revenueByCategory.ROOM_CHARGE).toBe(1000);
    expect(before.revenueByCategory.TAX).toBe(120);

    await asTenant(data.hotel.id, () =>
      folioService.voidTransaction(folioId, chargeId, data.hotel.id, {
        reason: 'خطأ إدخال',
        createdById: data.admin.id,
      }),
    );
    await asTenant(data.hotel.id, () =>
      folioService.voidTransaction(folioId, taxId, data.hotel.id, {
        reason: 'خطأ إدخال',
        createdById: data.admin.id,
      }),
    );

    const after = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    expect(after.kpis.netRevenue).toBe(0);
    expect(after.kpis.taxTotal).toBe(0);
    expect(after.kpis.grossBilled).toBe(0);
    expect(after.revenueByCategory.ROOM_CHARGE).toBe(0);
    expect(after.revenueByCategory.TAX).toBe(0);
  });

  it('includes ledger entries and nights occurring on the inclusive final day', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-LASTDAY-001', status: 'CHECKED_IN' });
    const folioId = await createFolio(bookingId, 'ACTIVE');

    await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'SERVICE',
      amount: 300,
      createdAt: tripoliAt('2026-03-31T12:00:00.000'),
    });
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-03-31T15:00:00.000'),
      checkOut: tripoliAt('2026-04-01T11:00:00.000'),
      nightlyRate: 100,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.period.totalDays).toBe(31);
    expect(report.revenueByCategory.SERVICE).toBe(300);
    expect(report.kpis.netRevenue).toBe(300);
    expect(report.inventory.occupiedRoomNights).toBe(1);
    expect(report.kpis.accruedRoomRevenue).toBe(100);
  });
});

describe('Executive KPI — overbooking & zero-division safety', () => {
  it('reports a true >100% occupancy and flags overbooking', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-OVER-001', status: 'CHECKED_IN' });

    for (let index = 0; index < 3; index += 1) {
      await createBookingRoom({
        bookingId,
        checkIn: tripoliAt('2026-04-01T00:00:00.000'),
        checkOut: tripoliAt('2026-04-02T00:00:00.000'),
        nightlyRate: 100,
      });
    }

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: '2026-04-01',
        endDate: '2026-04-01',
      }),
    );

    expect(report.period.totalDays).toBe(1);
    expect(report.inventory.availableRoomNights).toBe(2);
    expect(report.inventory.occupiedRoomNights).toBe(3);
    expect(report.kpis.occupancyRate).toBe(150);
    expect(report.kpis.isOverbooked).toBe(true);
    expect(report.kpis.accruedRoomRevenue).toBe(300);
    expect(report.kpis.adr).toBe(100);
    expect(report.kpis.revPar).toBe(150);
  });

  it('returns zero-safe KPIs when there are no sellable rooms', async () => {
    await prismaRaw.room.deleteMany({ where: { hotelId: data.hotel.id } });
    await prismaRaw.room.create({
      data: {
        hotelId: data.hotel.id,
        roomNumber: 'M-01',
        floor: 1,
        roomTypeId: data.singleType.id,
        status: 'MAINTENANCE',
      },
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.inventory.totalPhysicalRooms).toBe(1);
    expect(report.inventory.maintenanceRooms).toBe(1);
    expect(report.inventory.sellableRooms).toBe(0);
    expect(report.inventory.availableRoomNights).toBe(0);
    expect(report.kpis.occupancyRate).toBe(0);
    expect(report.kpis.adr).toBe(0);
    expect(report.kpis.revPar).toBe(0);
    expect(report.kpis.isOverbooked).toBe(false);
  });
});

describe('Executive KPI — operational alerts', () => {
  it('counts pending web bookings and unassigned rooms on live bookings', async () => {
    await createBooking({ bookingNo: 'KPI-WEB-001', status: 'PENDING', source: 'WEBSITE' });
    await createBooking({ bookingNo: 'KPI-WEB-002', status: 'CONFIRMED', source: 'WEBSITE' });

    const confirmedBooking = await createBooking({
      bookingNo: 'KPI-UNASSIGNED-001',
      status: 'CONFIRMED',
    });
    await createBookingRoom({
      bookingId: confirmedBooking,
      checkIn: tripoliAt('2026-03-05T00:00:00.000'),
      checkOut: tripoliAt('2026-03-06T00:00:00.000'),
      nightlyRate: 100,
      roomId: null,
    });

    const checkedOutBooking = await createBooking({
      bookingNo: 'KPI-UNASSIGNED-002',
      status: 'CHECKED_OUT',
    });
    await createBookingRoom({
      bookingId: checkedOutBooking,
      checkIn: tripoliAt('2026-03-05T00:00:00.000'),
      checkOut: tripoliAt('2026-03-06T00:00:00.000'),
      nightlyRate: 100,
      roomId: null,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.operationalAlerts.pendingWebBookings).toBe(1);
    expect(report.operationalAlerts.unassignedBookingRooms).toBe(1);
  });
});

describe('Executive KPI — Month-to-Date window', () => {
  it('derives the current Tripoli month-to-date bounds', () => {
    expect(getTripoliMonthToDateWindow(new Date('2026-10-24T10:00:00.000Z'))).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-24',
    });
  });

  it('rolls over to the new month at Tripoli midnight', () => {
    expect(getTripoliMonthToDateWindow(new Date('2026-10-31T23:30:00.000Z'))).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-01',
    });
  });
});

describe('Executive KPI — multi-tenant isolation', () => {
  it('never leaks another hotel inventory or ledger into the report', async () => {
    const otherHotel = await prismaRaw.hotel.create({
      data: { id: 'other-hotel', name: 'Other Hotel', currency: 'LYD' },
    });
    const otherRoomType = await prismaRaw.roomType.create({
      data: { hotelId: otherHotel.id, name: 'Other Single', baseRate: 150, capacity: 1 },
    });
    await prismaRaw.room.create({
      data: {
        hotelId: otherHotel.id,
        roomNumber: 'O-101',
        floor: 1,
        roomTypeId: otherRoomType.id,
        status: 'AVAILABLE',
      },
    });
    const otherBooking = await prismaRaw.booking.create({
      data: {
        hotelId: otherHotel.id,
        bookingNo: 'OTHER-BK-001',
        guestName: 'Other Guest',
        status: 'CHECKED_IN',
        source: 'RECEPTION',
      },
    });
    const otherFolio = await prismaRaw.folio.create({
      data: { hotelId: otherHotel.id, bookingId: otherBooking.id, status: 'ACTIVE' },
    });
    await prismaRaw.folioTransaction.create({
      data: {
        hotelId: otherHotel.id,
        folioId: otherFolio.id,
        type: 'CHARGE',
        category: 'ROOM_CHARGE',
        description: 'غرف',
        amount: 500,
        createdAt: tripoliAt('2026-03-10T10:00:00.000'),
      },
    });
    await prismaRaw.payment.create({
      data: {
        hotelId: otherHotel.id,
        folioId: otherFolio.id,
        amount: 500,
        method: 'CASH',
        status: 'SUCCEEDED',
        createdAt: tripoliAt('2026-03-11T10:00:00.000'),
      },
    });

    const ownReport = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );
    expect(ownReport.inventory.totalPhysicalRooms).toBe(2);
    expect(ownReport.kpis.netRevenue).toBe(0);
    expect(ownReport.kpis.totalCollected).toBe(0);

    const otherReport = await asTenant(otherHotel.id, () =>
      service.getExecutiveKpis({
        hotelId: otherHotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );
    expect(otherReport.inventory.totalPhysicalRooms).toBe(1);
    expect(otherReport.kpis.netRevenue).toBe(500);
    expect(otherReport.kpis.totalCollected).toBe(500);
  });
});

describe('Executive KPI — void sign conventions (A)', () => {
  it('voiding a DISCOUNT restores the pre-discount revenue state', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-DISC-001', status: 'CHECKED_IN' });
    const folioId = await createFolio(bookingId, 'ACTIVE');
    const now = new Date();
    const window = getTripoliMonthToDateWindow(now);

    await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 1000,
      createdAt: now,
    });
    // applyDiscount stores DISCOUNT as a NEGATIVE amount (-50).
    const discountId = await createLedgerEntry({
      folioId,
      type: 'DISCOUNT',
      category: 'DISCOUNT',
      amount: -50,
      createdAt: now,
    });

    const before = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    expect(before.kpis.netRevenue).toBe(950);
    expect(before.kpis.grossBilled).toBe(950);
    expect(before.revenueByCategory.DISCOUNT).toBe(-50);

    // voidTransaction posts a REFUND with amount = -(-50) = +50 (positive reversal).
    await asTenant(data.hotel.id, () =>
      folioService.voidTransaction(folioId, discountId, data.hotel.id, {
        reason: 'تصحيح خصم',
        createdById: data.admin.id,
      }),
    );

    const after = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    expect(after.kpis.netRevenue).toBe(1000);
    expect(after.kpis.grossBilled).toBe(1000);
    expect(after.revenueByCategory.DISCOUNT).toBe(0);
  });

  it('a payment refund (category REFUND) never changes billed revenue', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-PREFUND-001', status: 'CHECKED_IN' });
    const folioId = await createFolio(bookingId, 'ACTIVE');
    const now = new Date();
    const window = getTripoliMonthToDateWindow(now);

    await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 1000,
      createdAt: now,
    });
    const payment = await prismaRaw.payment.create({
      data: {
        hotelId: data.hotel.id,
        folioId,
        amount: 1000,
        method: 'CASH',
        status: 'SUCCEEDED',
        createdAt: now,
      },
    });

    const before = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    expect(before.kpis.netRevenue).toBe(1000);
    expect(before.kpis.taxTotal).toBe(0);
    expect(before.kpis.grossBilled).toBe(1000);
    expect(before.revenueByCategory.ROOM_CHARGE).toBe(1000);

    await asTenant(data.hotel.id, () =>
      paymentService.processRefund(payment.id, data.hotel.id, {
        amount: 200,
        reason: 'استرداد جزئي',
        createdById: data.admin.id,
        userRole: Role.ADMIN,
      }),
    );

    const after = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    );
    // A payment refund must never touch billed revenue.
    expect(after.kpis.netRevenue).toBe(1000);
    expect(after.kpis.taxTotal).toBe(0);
    expect(after.kpis.grossBilled).toBe(1000);
    expect(after.revenueByCategory.ROOM_CHARGE).toBe(1000);
  });
});

describe('Executive KPI — accrual vs billed reconciliation (C)', () => {
  it('matches accruedRoomRevenue to billed ROOM_CHARGE when both fall in the window', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-RECON-001', status: 'CHECKED_IN' });
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-03-10T00:00:00.000'),
      checkOut: tripoliAt('2026-03-13T00:00:00.000'),
      nightlyRate: 100,
    });
    const folioId = await createFolio(bookingId, 'ACTIVE');
    await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 300,
      createdAt: tripoliAt('2026-03-10T10:00:00.000'),
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.inventory.occupiedRoomNights).toBe(3);
    expect(report.kpis.accruedRoomRevenue).toBe(300);
    expect(report.revenueByCategory.ROOM_CHARGE).toBe(300);
  });

  it('documents divergence when ROOM_CHARGE is posted before the window (booking-time posting)', async () => {
    const bookingId = await createBooking({ bookingNo: 'KPI-RECON-002', status: 'CHECKED_IN' });
    await createBookingRoom({
      bookingId,
      checkIn: tripoliAt('2026-03-10T00:00:00.000'),
      checkOut: tripoliAt('2026-03-13T00:00:00.000'),
      nightlyRate: 100,
    });
    const folioId = await createFolio(bookingId, 'ACTIVE');
    // Room charges are posted for the FULL stay at booking creation, so this entry
    // sits outside the March window even though the stay is inside it.
    await createLedgerEntry({
      folioId,
      type: 'CHARGE',
      category: 'ROOM_CHARGE',
      amount: 300,
      createdAt: tripoliAt('2026-02-01T10:00:00.000'),
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: WINDOW_START,
        endDate: WINDOW_END,
      }),
    );

    expect(report.inventory.occupiedRoomNights).toBe(3);
    expect(report.kpis.accruedRoomRevenue).toBe(300);
    expect(report.revenueByCategory.ROOM_CHARGE).toBe(0);
  });
});

describe('Executive KPI — partial period clamp (D)', () => {
  it('clamps future nights to today and flags a partial period', async () => {
    const todayDayIndex = toTripoliDayIndex(Date.now());
    const today = new Date(todayDayIndex * 86400000).toISOString().slice(0, 10);
    const futureEnd = new Date((todayDayIndex + 10) * 86400000).toISOString().slice(0, 10);

    const bookingId = await createBooking({ bookingNo: 'KPI-PARTIAL-WIN-001', status: 'CHECKED_IN' });
    await createBookingRoom({
      bookingId,
      checkIn: tripoliDayStart(todayDayIndex),
      checkOut: tripoliDayStart(todayDayIndex + 5),
      nightlyRate: 100,
    });

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: today,
        endDate: futureEnd,
      }),
    );

    expect(report.period.isPartialPeriod).toBe(true);
    expect(report.period.effectiveEndDate).toBe(today);
    expect(report.period.totalDays).toBe(1);
    expect(report.inventory.availableRoomNights).toBe(2);
    expect(report.inventory.occupiedRoomNights).toBe(1);
    expect(report.kpis.accruedRoomRevenue).toBe(100);
  });

  it('returns an empty effective window when it starts in the future', async () => {
    const todayDayIndex = toTripoliDayIndex(Date.now());
    const tomorrow = new Date((todayDayIndex + 1) * 86400000).toISOString().slice(0, 10);
    const futureEnd = new Date((todayDayIndex + 10) * 86400000).toISOString().slice(0, 10);

    const report = await asTenant(data.hotel.id, () =>
      service.getExecutiveKpis({
        hotelId: data.hotel.id,
        startDate: tomorrow,
        endDate: futureEnd,
      }),
    );

    expect(report.period.isPartialPeriod).toBe(true);
    expect(report.period.totalDays).toBe(0);
    expect(report.inventory.availableRoomNights).toBe(0);
    expect(report.inventory.occupiedRoomNights).toBe(0);
    expect(report.kpis.accruedRoomRevenue).toBe(0);
  });
});
