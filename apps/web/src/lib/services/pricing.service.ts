import { prisma } from '@/lib/utils/prisma';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

interface RatePlanMatch {
  ratePlanId: string;
  nightlyRate: number;
  minStay: number;
  maxAdults: number;
  maxChildren: number;
  extraBedPrice: number | null;
  cancellationPolicyId: string | null;
}

export class PricingService {
  async findBestRatePlan(roomTypeId: string, roomId: string, checkIn: Date, checkOut: Date): Promise<RatePlanMatch | null> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { roomType: true },
    });
    if (!room) throw new NotFoundError('الغرفة غير موجودة');

    const activePlans = await prisma.ratePlan.findMany({
      where: {
        roomTypeId,
        isActive: true,
        startDate: { lte: checkIn },
        endDate: { gte: checkOut },
      },
      include: { cancellationPolicy: true },
      orderBy: { nightlyRate: 'asc' },
    });

    if (activePlans.length === 0) return null;

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);

    const validPlans = activePlans.filter((plan) => {
      if (plan.minStay > nights) return false;

      if (plan.applyDays) {
        const days = plan.applyDays.split(',');
        for (let i = 0; i < nights; i++) {
          const d = new Date(checkIn);
          d.setDate(d.getDate() + i);
          const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
          if (!days.includes(dayName)) return false;
        }
      }

      return true;
    });

    if (validPlans.length === 0) return null;

    const best = validPlans[0];

    return {
      ratePlanId: best.id,
      nightlyRate: best.nightlyRate,
      minStay: best.minStay,
      maxAdults: best.maxAdults,
      maxChildren: best.maxChildren,
      extraBedPrice: best.extraBedPrice,
      cancellationPolicyId: best.cancellationPolicyId,
    };
  }

  calculateCancellationRefund(rules: string, totalAmount: number, hoursBeforeCheckIn: number): { refundAmount: number; refundPercentage: number } {
    let parsed: any;
    try {
      parsed = JSON.parse(rules);
    } catch {
      return { refundAmount: 0, refundPercentage: 0 };
    }

    const tiers = Array.isArray(parsed) ? parsed : [parsed];

    for (const tier of tiers) {
      if (tier.cancelBeforeHours !== undefined && hoursBeforeCheckIn >= tier.cancelBeforeHours) {
        const pct = tier.refundPercentage || 0;
        return { refundAmount: (totalAmount * pct) / 100, refundPercentage: pct };
      }
    }

    const lastTier = tiers[tiers.length - 1];
    const pct = lastTier?.refundPercentage || 0;
    return { refundAmount: (totalAmount * pct) / 100, refundPercentage: pct };
  }

  async getApplicableRate(roomId: string, checkIn: Date, checkOut: Date): Promise<{ nightlyRate: number; ratePlanId?: string; cancellationPolicyId?: string }> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { roomType: true },
    });
    if (!room) throw new NotFoundError('الغرفة غير موجودة');

    const plan = await this.findBestRatePlan(room.roomTypeId, roomId, checkIn, checkOut);
    if (plan) {
      return {
        nightlyRate: plan.nightlyRate,
        ratePlanId: plan.ratePlanId,
        cancellationPolicyId: plan.cancellationPolicyId || undefined,
      };
    }

    return { nightlyRate: room.roomType.baseRate };
  }

  async checkAvailability(roomId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return false;
    if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') return false;

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
    if (nights < 1) return false;

    const conflictingBooking = await prisma.bookingRoom.findFirst({
      where: {
        roomId,
        booking: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });

    return !conflictingBooking;
  }
}
