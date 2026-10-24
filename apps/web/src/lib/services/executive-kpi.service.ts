import { prisma } from '@/lib/utils/prisma';
import { ValidationError } from '@/lib/utils/errors';

const TIMEZONE = 'Africa/Tripoli' as const;
const TRIPOLI_OFFSET_MS = 2 * 3600_000;
const MS_PER_DAY = 86400_000;

// Actual stay nights only: CONFIRMED (not yet arrived) must not inflate accrual KPIs.
const OCCUPYING_BOOKING_STATUSES = ['CHECKED_IN', 'CHECKED_OUT'] as const;

const REVENUE_CATEGORIES = new Set([
  'ROOM_CHARGE',
  'RESTAURANT',
  'SERVICE',
  'SAFE_DEPOSIT',
  'TAX',
  'DISCOUNT',
]);

export interface TripoliWindow {
  startBound: Date;
  endBound: Date;
  totalDays: number;
  startDayIndex: number;
  /** Exclusive upper calendar-day index (start of the day AFTER the inclusive endDate). */
  endDayIndex: number;
}

export interface ExecutiveKpiPeriod {
  startBound: string;
  endBound: string;
  totalDays: number;
  effectiveEndDate: string;
  isPartialPeriod: boolean;
  timezone: typeof TIMEZONE;
}

export interface ExecutiveKpiInventory {
  totalPhysicalRooms: number;
  maintenanceRooms: number;
  sellableRooms: number;
  availableRoomNights: number;
  occupiedRoomNights: number;
}

export interface ExecutiveKpis {
  occupancyRate: number;
  isOverbooked: boolean;
  accruedRoomRevenue: number;
  adr: number;
  revPar: number;
  netRevenue: number;
  taxTotal: number;
  grossBilled: number;
  totalCollected: number;
  collectionRate: number;
}

export interface ExecutiveKpiAlerts {
  pendingWebBookings: number;
  unassignedBookingRooms: number;
}

export interface ExecutiveKpiReport {
  period: ExecutiveKpiPeriod;
  inventory: ExecutiveKpiInventory;
  kpis: ExecutiveKpis;
  revenueByCategory: Record<string, number>;
  operationalAlerts: ExecutiveKpiAlerts;
}

export interface GetExecutiveKpisParams {
  hotelId: string;
  startDate: string | Date;
  endDate: string | Date;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Tripoli (UTC+02:00) calendar-day index for an absolute timestamp. */
export function toTripoliDayIndex(timestamp: number): number {
  return Math.floor((timestamp + TRIPOLI_OFFSET_MS) / MS_PER_DAY);
}

/** UTC instant corresponding to 00:00:00.000 Africa/Tripoli for a calendar-day index. */
export function tripoliDayStart(dayIndex: number): Date {
  return new Date(dayIndex * MS_PER_DAY - TRIPOLI_OFFSET_MS);
}

function parseCalendarDayIndex(input: string | Date, label: string): number {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new ValidationError(`${label} غير صالح`);
    return toTripoliDayIndex(input.getTime());
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) throw new ValidationError(`${label} مطلوب`);

  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const check = new Date(utcMidnight);
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      throw new ValidationError(`${label} غير صالح`);
    }
    return Math.floor(utcMidnight / MS_PER_DAY);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} غير صالح`);
  return toTripoliDayIndex(parsed.getTime());
}

/** Calendar date (`YYYY-MM-DD`) for a Tripoli calendar-day index. */
function tripoliDateString(dayIndex: number): string {
  return new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Normalizes inputs to Tripoli calendar days with an INCLUSIVE end date.
 * Both `YYYY-MM-DD` and full timestamps are snapped to their Tripoli calendar day.
 */
export function parseTripoliWindow(
  startInput: string | Date,
  endInput: string | Date,
): TripoliWindow {
  const startDayIndex = parseCalendarDayIndex(startInput, 'تاريخ البداية');
  const endDayIndex = parseCalendarDayIndex(endInput, 'تاريخ النهاية');
  const endDayExclusive = endDayIndex + 1;

  if (endDayExclusive <= startDayIndex) {
    throw new ValidationError('تاريخ النهاية يجب أن يكون في تاريخ البداية أو بعده');
  }

  return {
    startBound: tripoliDayStart(startDayIndex),
    endBound: tripoliDayStart(endDayExclusive),
    totalDays: endDayExclusive - startDayIndex,
    startDayIndex,
    endDayIndex: endDayExclusive,
  };
}

/** Default reporting window: Tripoli Month-to-Date (first of month → today, inclusive). */
export function getTripoliMonthToDateWindow(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const wallClock = new Date(now.getTime() + TRIPOLI_OFFSET_MS);
  const year = wallClock.getUTCFullYear();
  const month = pad2(wallClock.getUTCMonth() + 1);
  const day = pad2(wallClock.getUTCDate());
  return { startDate: `${year}-${month}-01`, endDate: `${year}-${month}-${day}` };
}

export class ExecutiveKpiService {
  async getExecutiveKpis(params: GetExecutiveKpisParams): Promise<ExecutiveKpiReport> {
    const { hotelId } = params;
    if (!hotelId) throw new ValidationError('معرّف الفندق مطلوب');

    const { startBound, startDayIndex, endDayIndex } = parseTripoliWindow(
      params.startDate,
      params.endDate,
    );

    // Clamp every calculation to "today" (Tripoli): future nights/revenue never accrue.
    const todayDayIndex = toTripoliDayIndex(Date.now());
    const effectiveEndDayIndex = Math.min(endDayIndex, todayDayIndex + 1);
    const effectiveTotalDays = Math.max(0, effectiveEndDayIndex - startDayIndex);
    const isPartialPeriod = endDayIndex > todayDayIndex + 1;
    const effectiveEndBound =
      effectiveTotalDays > 0 ? tripoliDayStart(effectiveEndDayIndex) : startBound;
    const effectiveEndDate = tripoliDateString(effectiveEndDayIndex - 1);

    // --- Inventory (DB-level counts) ---
    const totalPhysicalRooms = await prisma.room.count({ where: { hotelId } });
    const maintenanceRooms = await prisma.room.count({
      where: { hotelId, status: 'MAINTENANCE' },
    });
    const sellableRooms = totalPhysicalRooms - maintenanceRooms;
    const availableRoomNights = sellableRooms * effectiveTotalDays;

    // --- Occupied room-nights & accrual room revenue (date-filtered, calendar-day overlap) ---
    const overlappingRooms = await prisma.bookingRoom.findMany({
      where: {
        hotelId,
        checkIn: { lt: effectiveEndBound },
        checkOut: { gt: startBound },
        booking: { hotelId, status: { in: [...OCCUPYING_BOOKING_STATUSES] } },
      },
      select: { checkIn: true, checkOut: true, nightlyRate: true },
    });

    let occupiedRoomNights = 0;
    let accruedRoomRevenue = 0;

    for (const room of overlappingRooms) {
      const checkInDayIndex = toTripoliDayIndex(room.checkIn.getTime());
      const checkOutDayIndex = toTripoliDayIndex(room.checkOut.getTime());
      const overlapStartDay = Math.max(checkInDayIndex, startDayIndex);
      const overlapEndDay = Math.min(checkOutDayIndex, effectiveEndDayIndex);
      const nights = Math.max(0, overlapEndDay - overlapStartDay);
      occupiedRoomNights += nights;
      accruedRoomRevenue += Number(room.nightlyRate) * nights;
    }

    const roomRevenue = round2(accruedRoomRevenue);

    const occupancyRate =
      availableRoomNights > 0
        ? round2((occupiedRoomNights / availableRoomNights) * 100)
        : 0;
    const isOverbooked = occupiedRoomNights > availableRoomNights;
    const adr = occupiedRoomNights > 0 ? round2(roomRevenue / occupiedRoomNights) : 0;
    const revPar = availableRoomNights > 0 ? round2(roomRevenue / availableRoomNights) : 0;

    // --- Ledger aggregations (DB-level groupBy / aggregate) ---
    // REFUND rows reverse either a revenue entry (void/early-checkout/room-move, carrying
    // the original revenue category) or a payment (category REFUND/PAYMENT). Only the
    // former belong to revenue; the latter are already reflected in payment collections.
    const ledgerRows = await prisma.folioTransaction.groupBy({
      by: ['type', 'category'],
      where: {
        hotelId,
        createdAt: { gte: startBound, lt: effectiveEndBound },
        type: { in: ['CHARGE', 'DISCOUNT', 'REFUND'] },
        folio: { is: { hotelId, status: { not: 'VOID' } } },
      },
      _sum: { amount: true },
    });

    const revenueByCategory: Record<string, number> = {
      ROOM_CHARGE: 0,
      RESTAURANT: 0,
      SERVICE: 0,
      SAFE_DEPOSIT: 0,
      TAX: 0,
      DISCOUNT: 0,
    };

    let netRevenue = 0;
    let taxTotal = 0;

    for (const row of ledgerRows) {
      const amount = Number(row._sum.amount ?? 0);

      if (row.type === 'CHARGE') {
        revenueByCategory[row.category] = round2(
          (revenueByCategory[row.category] ?? 0) + amount,
        );
        if (row.category === 'TAX') {
          taxTotal += amount;
        } else {
          netRevenue += amount;
        }
        continue;
      }

      if (row.type === 'DISCOUNT') {
        // Discounts reduce net revenue regardless of sign convention.
        netRevenue -= Math.abs(amount);
        revenueByCategory.DISCOUNT = round2(
          (revenueByCategory.DISCOUNT ?? 0) - Math.abs(amount),
        );
        continue;
      }

      if (row.type === 'REFUND' && REVENUE_CATEGORIES.has(row.category)) {
        // Reversal of a revenue entry: fold the (signed) amount back into its category.
        revenueByCategory[row.category] = round2(
          (revenueByCategory[row.category] ?? 0) + amount,
        );
        if (row.category === 'TAX') {
          taxTotal += amount;
        } else {
          netRevenue += amount;
        }
      }
    }

    netRevenue = round2(netRevenue);
    taxTotal = round2(taxTotal);
    const grossBilled = round2(netRevenue + taxTotal);

    const paymentAggregate = await prisma.payment.aggregate({
      where: {
        hotelId,
        status: 'SUCCEEDED',
        createdAt: { gte: startBound, lt: effectiveEndBound },
        folio: { is: { hotelId, status: { not: 'VOID' } } },
      },
      _sum: { amount: true, refundedAmount: true },
    });

    const totalCollected = round2(
      Number(paymentAggregate._sum.amount ?? 0) -
        Number(paymentAggregate._sum.refundedAmount ?? 0),
    );

    const collectionRate = grossBilled > 0 ? round2((totalCollected / grossBilled) * 100) : 0;

    // --- Operational alerts (lean, booking-focused) ---
    const pendingWebBookings = await prisma.booking.count({
      where: { hotelId, status: 'PENDING', source: 'WEBSITE' },
    });

    const unassignedBookingRooms = await prisma.bookingRoom.count({
      where: {
        hotelId,
        roomId: null,
        booking: { hotelId, status: { in: ['PENDING', 'CONFIRMED'] } },
      },
    });

    return {
      period: {
        startBound: startBound.toISOString(),
        endBound: effectiveEndBound.toISOString(),
        totalDays: effectiveTotalDays,
        effectiveEndDate,
        isPartialPeriod,
        timezone: TIMEZONE,
      },
      inventory: {
        totalPhysicalRooms,
        maintenanceRooms,
        sellableRooms,
        availableRoomNights,
        occupiedRoomNights,
      },
      kpis: {
        occupancyRate,
        isOverbooked,
        accruedRoomRevenue: roomRevenue,
        adr,
        revPar,
        netRevenue,
        taxTotal,
        grossBilled,
        totalCollected,
        collectionRate,
      },
      revenueByCategory,
      operationalAlerts: {
        pendingWebBookings,
        unassignedBookingRooms,
      },
    };
  }
}

export const executiveKpiService = new ExecutiveKpiService();
