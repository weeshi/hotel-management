import { z } from 'zod';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { createAuditLog } from './audit.service';

const folioRepo = new FolioRepository();

// --- Group booking lifecycle status guard (single source of truth) ---
export const GROUP_BOOKING_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type GroupBookingStatus = (typeof GROUP_BOOKING_STATUSES)[number];

export const groupBookingStatusSchema = z.enum(GROUP_BOOKING_STATUSES);

const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'اسم المجموعة مطلوب'),
  status: groupBookingStatusSchema.optional(),
  companyName: z.string().trim().min(1, 'اسم الشركة غير صالح').optional(),
  contactName: z.string().trim().min(1, 'اسم جهة الاتصال غير صالح').optional(),
  contactPhone: z.string().trim().min(1, 'رقم الهاتف غير صالح').optional(),
  contactEmail: z.string().trim().email('البريد الإلكتروني غير صالح').optional(),
  checkIn: z.coerce.date({ invalid_type_error: 'تاريخ الوصول غير صالح' }).optional(),
  checkOut: z.coerce.date({ invalid_type_error: 'تاريخ المغادرة غير صالح' }).optional(),
  notes: z.string().trim().optional(),
});

interface CreateGroupParams {
  name: string;
  hotelId: string;
  createdById?: string;
  status?: GroupBookingStatus;
  companyName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  checkIn?: Date;
  checkOut?: Date;
  notes?: string;
}

interface AssignBookingsParams {
  groupId: string;
  hotelId: string;
  bookingIds: string[];
  createdById?: string;
}

interface RoutingRuleInput {
  chargeType: string;
  targetFolioId: string;
}

type BreakdownSlot = 'masterAmount' | 'subFoliosAmount';

export interface GroupReportCategoryBreakdown {
  masterAmount: number;
  subFoliosAmount: number;
  totalAmount: number;
}

export interface GroupReportFolioSummary {
  id: string;
  status: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
}

export interface GroupReportOccupancySummary {
  totalBookings: number;
  cancelledBookings: number;
  statusBreakdown: Record<string, number>;
  totalRooms: number;
  assignedRooms: number;
  unassignedRooms: number;
  totalRoomNights: number;
  totalGuests: { adults: number; children: number };
}

export interface GroupReportMemberBreakdown {
  bookingId: string;
  bookingNo: string;
  guestName: string | null;
  status: string;
  roomNumbers: string[];
  unassignedCount: number;
  nights: number;
  folioId: string | null;
  totalCharges: number;
  totalPaid: number;
  balance: number;
}

export interface GroupReportRoutingRule {
  id: string;
  chargeType: string;
  targetFolioId: string;
}

export interface GroupReportFinancialSummary {
  masterFolio: GroupReportFolioSummary | null;
  subFoliosTotals: { totalCharges: number; totalPaid: number; balance: number };
  consolidatedTotals: { totalCharges: number; totalPaid: number; balance: number };
  chargesByCategory: Record<string, GroupReportCategoryBreakdown>;
  paymentsByMethod: Record<string, GroupReportCategoryBreakdown>;
}

export interface GroupReport {
  group: {
    id: string;
    name: string;
    companyName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    checkIn: Date | null;
    checkOut: Date | null;
    status: string;
    notes: string | null;
    createdAt: Date;
  };
  occupancySummary: GroupReportOccupancySummary;
  financialSummary: GroupReportFinancialSummary;
  memberBreakdown: GroupReportMemberBreakdown[];
  routingRules: GroupReportRoutingRule[];
}

interface ChargeTransactionLike {
  type: string;
  category: string;
  amount: number;
}

interface ReportPaymentLike {
  status: string;
  method: string;
  amount: number;
  refundedAmount: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeNights(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));
}

function ensureBreakdown(
  bucket: Record<string, GroupReportCategoryBreakdown>,
  key: string,
): GroupReportCategoryBreakdown {
  const existing = bucket[key];
  if (existing) return existing;
  const created: GroupReportCategoryBreakdown = {
    masterAmount: 0,
    subFoliosAmount: 0,
    totalAmount: 0,
  };
  bucket[key] = created;
  return created;
}

function accumulateCharges(
  bucket: Record<string, GroupReportCategoryBreakdown>,
  transactions: ChargeTransactionLike[],
  slot: BreakdownSlot,
): void {
  for (const transaction of transactions) {
    if (transaction.type !== 'CHARGE' && transaction.type !== 'DISCOUNT') continue;
    const entry = ensureBreakdown(bucket, transaction.category);
    entry[slot] = round2(entry[slot] + Number(transaction.amount));
  }
}

function accumulatePayments(
  bucket: Record<string, GroupReportCategoryBreakdown>,
  payments: ReportPaymentLike[],
  slot: BreakdownSlot,
): void {
  for (const payment of payments) {
    if (payment.status !== 'SUCCEEDED') continue;
    const net = Number(payment.amount) - Number(payment.refundedAmount || 0);
    const entry = ensureBreakdown(bucket, payment.method);
    entry[slot] = round2(entry[slot] + net);
  }
}

function finalizeBreakdown(bucket: Record<string, GroupReportCategoryBreakdown>): void {
  for (const key of Object.keys(bucket)) {
    const entry = bucket[key];
    entry.totalAmount = round2(entry.masterAmount + entry.subFoliosAmount);
  }
}

// A sub-folio is "live" for consolidation when it either carries active charges
// (CHARGE/DISCOUNT) or succeeded payments (net of refunds). A cancelled booking's
// zero-activity folio must not linger in the financial totals, yet a non-voided
// cancellation penalty charge must still be preserved.
function hasActiveFolioActivity(
  transactions: ChargeTransactionLike[],
  payments: ReportPaymentLike[],
): boolean {
  let chargeNet = 0;
  for (const transaction of transactions) {
    if (transaction.type !== 'CHARGE' && transaction.type !== 'DISCOUNT') continue;
    chargeNet += Number(transaction.amount);
  }
  let paymentNet = 0;
  for (const payment of payments) {
    if (payment.status !== 'SUCCEEDED') continue;
    paymentNet += Number(payment.amount) - Number(payment.refundedAmount || 0);
  }
  return Math.abs(chargeNet) > 0.005 || Math.abs(paymentNet) > 0.005;
}

export class GroupBookingService {
  async create(params: CreateGroupParams) {
    const parsed = createGroupSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'بيانات المجموعة غير صالحة');
    }

    const { hotelId, createdById } = params;
    const {
      name,
      status,
      companyName,
      contactName,
      contactPhone,
      contactEmail,
      checkIn,
      checkOut,
      notes,
    } = parsed.data;

    return tenantTx(async (tx) => {
      const placeholderBooking = await tx.booking.create({
        data: {
          bookingNo: `GRP-${Date.now()}`,
          hotelId,
          guestName: name,
          adults: 1,
          children: 0,
          status: 'CONFIRMED',
        },
      });

      const folio = await tx.folio.create({
        data: {
          hotelId,
          bookingId: placeholderBooking.id,
          status: 'ACTIVE',
        },
      });

      const group = await tx.groupBooking.create({
        data: {
          name,
          hotelId,
          status: status ?? 'ACTIVE',
          companyName: companyName ?? null,
          contactName: contactName ?? null,
          contactPhone: contactPhone ?? null,
          contactEmail: contactEmail ?? null,
          checkIn: checkIn ?? null,
          checkOut: checkOut ?? null,
          notes: notes ?? null,
          masterFolioId: folio.id,
        },
      });

      await createAuditLog({
        hotelId,
        userId: createdById,
        action: 'GROUP_CREATED',
        entity: 'GROUP_BOOKING',
        entityId: group.id,
        newValue: JSON.stringify({ name }),
      });

      return tx.groupBooking.findUnique({
        where: { id: group.id },
        include: {
          masterFolio: {
            include: { transactions: true, payments: true },
          },
          bookings: {
            include: {
              guest: true,
              rooms: { include: { room: true } },
              folio: {
                include: { transactions: true, payments: true },
              },
            },
          },
          routingRules: {
            include: { targetFolio: true },
          },
        },
      });
    });
  }

  async getById(groupId: string, hotelId: string) {
    const group = await prisma.groupBooking.findFirst({
      where: { id: groupId, hotelId },
      include: {
        masterFolio: {
          include: { transactions: true, payments: true },
        },
        bookings: {
          include: {
            guest: true,
            rooms: { include: { room: true } },
            folio: {
              include: { transactions: true, payments: true },
            },
          },
        },
        routingRules: {
          include: { targetFolio: true },
        },
      },
    });

    if (!group) throw new NotFoundError('المجموعة غير موجودة');
    return group;
  }

  async list(hotelId: string) {
    return prisma.groupBooking.findMany({
      where: { hotelId },
      include: {
        masterFolio: true,
        bookings: {
          include: {
            guest: true,
            rooms: { include: { room: true } },
          },
        },
        routingRules: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignBookings(params: AssignBookingsParams) {
    const { groupId, hotelId, bookingIds, createdById } = params;

    const group = await prisma.groupBooking.findFirst({
      where: { id: groupId, hotelId },
      include: { bookings: true },
    });
    if (!group) throw new NotFoundError('المجموعة غير موجودة');

    const bookings = await prisma.booking.findMany({
      where: { id: { in: bookingIds }, hotelId: group.hotelId },
      include: { folio: true, rooms: { include: { room: true } } },
    });

    if (bookings.length !== bookingIds.length) {
      throw new ValidationError('بعض الحجوزات غير موجودة أو لا تنتمي لنفس الفندق');
    }

    for (const booking of bookings) {
      if (booking.groupBookingId) {
        throw new ValidationError(`الحجز ${booking.bookingNo} منتمي لمجموعة بالفعل`);
      }
    }

    return tenantTx(async (tx) => {
      for (const booking of bookings) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { groupBookingId: groupId },
        });
      }

      const groupWithFolios = await tx.groupBooking.findUnique({
        where: { id: groupId },
        include: {
          masterFolio: {
            include: { transactions: true, payments: true },
          },
          bookings: {
            include: {
              guest: true,
              rooms: { include: { room: true } },
              folio: {
                include: { transactions: true, payments: true },
              },
            },
          },
          routingRules: {
            include: { targetFolio: true },
          },
        },
      });

      await createAuditLog({
        hotelId: group.hotelId,
        userId: createdById,
        action: 'GROUP_BOOKINGS_ASSIGNED',
        entity: 'GROUP_BOOKING',
        entityId: groupId,
        newValue: JSON.stringify({
          bookingIds,
          count: bookings.length,
        }),
      });

      return groupWithFolios;
    });
  }

  async setRoutingRules(groupId: string, hotelId: string, rules: RoutingRuleInput[], createdById?: string) {
    const group = await prisma.groupBooking.findFirst({
      where: { id: groupId, hotelId },
      include: { masterFolio: true, bookings: { include: { folio: true } } },
    });
    if (!group) throw new NotFoundError('المجموعة غير موجودة');

    const folioIds = new Set(rules.map(r => r.targetFolioId));
    if (group.masterFolioId) folioIds.add(group.masterFolioId);
    for (const booking of group.bookings) {
      if (booking.folio) folioIds.add(booking.folio.id);
    }

    const existingFolios = await prisma.folio.findMany({
      where: { id: { in: Array.from(folioIds) }, booking: { hotelId } },
    });
    const existingFolioIds = new Set(existingFolios.map(f => f.id));

    for (const rule of rules) {
      if (!existingFolioIds.has(rule.targetFolioId)) {
        throw new ValidationError(`الفاتورة ${rule.targetFolioId} غير موجودة`);
      }
    }

    return tenantTx(async (tx) => {
      await tx.folioRoutingRule.deleteMany({
        where: { groupBookingId: groupId },
      });

      if (rules.length > 0) {
        await tx.folioRoutingRule.createMany({
          data: rules.map(r => ({
            hotelId: group.hotelId,
            groupBookingId: groupId,
            chargeType: r.chargeType,
            targetFolioId: r.targetFolioId,
          })),
        });
      }

      await createAuditLog({
        hotelId: group.hotelId,
        userId: createdById,
        action: 'ROUTING_RULES_UPDATED',
        entity: 'GROUP_BOOKING',
        entityId: groupId,
        newValue: JSON.stringify({ rules }),
      });

      return tx.groupBooking.findUnique({
        where: { id: groupId },
        include: {
          masterFolio: {
            include: { transactions: true, payments: true },
          },
          bookings: {
            include: {
              guest: true,
              rooms: { include: { room: true } },
              folio: {
                include: { transactions: true, payments: true },
              },
            },
          },
          routingRules: {
            include: { targetFolio: true },
          },
        },
      });
    });
  }

  async getTargetFolio(bookingId: string, chargeType: string, hotelId?: string): Promise<string | null> {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, ...(hotelId ? { hotelId } : {}) },
      include: {
        groupBooking: {
          include: {
            routingRules: true,
            masterFolio: true,
          },
        },
        folio: true,
      },
    });

    if (!booking) return null;
    if (!booking.groupBooking) return booking.folio?.id || null;

    const rule = booking.groupBooking.routingRules.find(r => r.chargeType === chargeType);
    if (rule) return rule.targetFolioId;

    if (chargeType === 'ROOM_CHARGE' || chargeType === 'TAX' || chargeType === 'DISCOUNT') {
      return booking.groupBooking.masterFolioId;
    }

    return booking.folio?.id || null;
  }

  async getGroupReport(groupId: string, hotelId: string): Promise<GroupReport> {
    const group = await prisma.groupBooking.findFirst({
      where: { id: groupId, hotelId },
      include: {
        masterFolio: {
          include: { transactions: true, payments: true, discounts: true },
        },
        routingRules: true,
        bookings: {
          include: {
            guest: true,
            rooms: { include: { room: true, roomType: true } },
            folio: {
              include: { transactions: true, payments: true, discounts: true },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundError('حجز المجموعة غير موجود');

    const memberBookings = group.bookings;
    const activeBookings = memberBookings.filter((booking) => booking.status !== 'CANCELLED');

    const statusBreakdown: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      CHECKED_IN: 0,
      CHECKED_OUT: 0,
      CANCELLED: 0,
    };
    for (const booking of memberBookings) {
      statusBreakdown[booking.status] = (statusBreakdown[booking.status] || 0) + 1;
    }

    let totalRooms = 0;
    let assignedRooms = 0;
    let unassignedRooms = 0;
    let totalRoomNights = 0;
    let totalAdults = 0;
    let totalChildren = 0;

    for (const booking of activeBookings) {
      totalAdults += booking.adults;
      totalChildren += booking.children;
      for (const room of booking.rooms) {
        totalRooms += 1;
        if (room.roomId) {
          assignedRooms += 1;
        } else {
          unassignedRooms += 1;
        }
        totalRoomNights += computeNights(room.checkIn, room.checkOut);
      }
    }

    const masterFolio = group.masterFolio;
    const subFolios = memberBookings.flatMap((booking) => {
      const folio = booking.folio;
      if (!folio) return [];
      // Voided folios never count toward consolidated financials.
      if (folio.status === 'VOID') return [];
      // A cancelled member's zero-activity folio is dead weight; exclude it while
      // preserving any non-voided cancellation penalty charges/payments.
      if (booking.status === 'CANCELLED' && !hasActiveFolioActivity(folio.transactions, folio.payments)) {
        return [];
      }
      return [folio];
    });

    const masterSummary: GroupReportFolioSummary | null = masterFolio
      ? {
          id: masterFolio.id,
          status: masterFolio.status,
          totalCharges: round2(Number(masterFolio.totalCharges)),
          totalPaid: round2(Number(masterFolio.totalPaid)),
          balance: round2(Number(masterFolio.balance)),
        }
      : null;

    const subTotals = subFolios.reduce(
      (acc, folio) => {
        acc.totalCharges += Number(folio.totalCharges);
        acc.totalPaid += Number(folio.totalPaid);
        acc.balance += Number(folio.balance);
        return acc;
      },
      { totalCharges: 0, totalPaid: 0, balance: 0 },
    );

    const chargesByCategory: Record<string, GroupReportCategoryBreakdown> = {};
    if (masterFolio) {
      accumulateCharges(chargesByCategory, masterFolio.transactions, 'masterAmount');
    }
    for (const folio of subFolios) {
      accumulateCharges(chargesByCategory, folio.transactions, 'subFoliosAmount');
    }
    finalizeBreakdown(chargesByCategory);

    const paymentsByMethod: Record<string, GroupReportCategoryBreakdown> = {};
    if (masterFolio) {
      accumulatePayments(paymentsByMethod, masterFolio.payments, 'masterAmount');
    }
    for (const folio of subFolios) {
      accumulatePayments(paymentsByMethod, folio.payments, 'subFoliosAmount');
    }
    finalizeBreakdown(paymentsByMethod);

    const masterCharges = masterSummary ? masterSummary.totalCharges : 0;
    const masterPaid = masterSummary ? masterSummary.totalPaid : 0;
    const masterBalance = masterSummary ? masterSummary.balance : 0;

    const memberBreakdown: GroupReportMemberBreakdown[] = memberBookings.map((booking) => {
      const nights = booking.rooms.reduce(
        (sum, room) => sum + computeNights(room.checkIn, room.checkOut),
        0,
      );
      const roomNumbers = booking.rooms
        .map((room) => room.room?.roomNumber)
        .filter((value): value is string => Boolean(value));
      const unassignedCount = booking.rooms.filter((room) => room.roomId === null).length;
      const folio = booking.folio;

      return {
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
        guestName: booking.guestName,
        status: booking.status,
        roomNumbers,
        unassignedCount,
        nights,
        folioId: folio ? folio.id : null,
        totalCharges: folio ? round2(Number(folio.totalCharges)) : 0,
        totalPaid: folio ? round2(Number(folio.totalPaid)) : 0,
        balance: folio ? round2(Number(folio.balance)) : 0,
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        companyName: group.companyName,
        contactName: group.contactName,
        contactPhone: group.contactPhone,
        contactEmail: group.contactEmail,
        checkIn: group.checkIn,
        checkOut: group.checkOut,
        status: group.status,
        notes: group.notes,
        createdAt: group.createdAt,
      },
      occupancySummary: {
        totalBookings: activeBookings.length,
        cancelledBookings: memberBookings.length - activeBookings.length,
        statusBreakdown,
        totalRooms,
        assignedRooms,
        unassignedRooms,
        totalRoomNights,
        totalGuests: { adults: totalAdults, children: totalChildren },
      },
      financialSummary: {
        masterFolio: masterSummary,
        subFoliosTotals: {
          totalCharges: round2(subTotals.totalCharges),
          totalPaid: round2(subTotals.totalPaid),
          balance: round2(subTotals.balance),
        },
        consolidatedTotals: {
          totalCharges: round2(masterCharges + subTotals.totalCharges),
          totalPaid: round2(masterPaid + subTotals.totalPaid),
          balance: round2(masterBalance + subTotals.balance),
        },
        chargesByCategory,
        paymentsByMethod,
      },
      memberBreakdown,
      routingRules: group.routingRules.map((rule) => ({
        id: rule.id,
        chargeType: rule.chargeType,
        targetFolioId: rule.targetFolioId,
      })),
    };
  }
}
