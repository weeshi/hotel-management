import { prisma, tenantTx } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { createAuditLog } from './audit.service';

const folioRepo = new FolioRepository();

interface CreateGroupParams {
  name: string;
  hotelId: string;
  createdById?: string;
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

export class GroupBookingService {
  async create(params: CreateGroupParams) {
    const { name, hotelId, createdById } = params;

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
}
