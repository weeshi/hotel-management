import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { resolveTenantFromRequest } from '@/lib/utils/tenant';
import { PricingService } from '@/lib/services/pricing.service';
import { WebsiteSettingsService } from '@/lib/services/website-settings.service';

const pricingService = new PricingService();
const websiteSettingsService = new WebsiteSettingsService();

interface RatePlanWithDates {
  id: string;
  nightlyRate: number;
  minStay: number;
  maxAdults: number;
  maxChildren: number;
  cancellationPolicyId: string | null;
  applyDays: string | null;
}

function planCoversStay(plan: RatePlanWithDates, checkInDate: Date, nights: number): boolean {
  if (plan.minStay > nights) return false;
  if (!plan.applyDays) return true;
  const days = plan.applyDays.split(',');
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkInDate);
    d.setDate(d.getDate() + i);
    const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
    if (!days.includes(dayName)) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const hotel = await resolveTenantFromRequest(request);
    if (!hotel) {
      return errorResponse('فندق غير موجود لهذا النطاق', 404);
    }

    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const adults = parseInt(searchParams.get('adults') || '1', 10);
    const children = parseInt(searchParams.get('children') || '0', 10);
    const roomTypeId = searchParams.get('roomTypeId') || undefined;

    if (!checkIn || !checkOut) {
      return errorResponse('checkIn و checkOut مطلوبان', 400);
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return errorResponse('تنسيق التاريخ غير صالح', 400);
    }

    if (checkInDate >= checkOutDate) {
      return errorResponse('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول', 400);
    }

    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);
    if (nights < 1) {
      return errorResponse('مدة الإقامة يجب أن تكون ليلة واحدة على الأقل', 400);
    }

    const websiteSettings = await websiteSettingsService.getSettings(hotel.id);

    const roomTypes = await prisma.roomType.findMany({
      where: {
        hotelId: hotel.id,
        isWebVisible: true,
        ...(roomTypeId ? { id: roomTypeId } : {}),
      },
      include: {
        rooms: {
          where: { status: 'AVAILABLE' },
          select: { id: true },
        },
        ratePlans: {
          where: {
            isActive: true,
            startDate: { lte: checkInDate },
            endDate: { gte: checkOutDate },
          },
          include: { cancellationPolicy: true },
          orderBy: { nightlyRate: 'asc' },
        },
      },
    });

    const availability = [];

    for (const rt of roomTypes) {
      const bestPlan = (rt.ratePlans as unknown as RatePlanWithDates[]).find((p) =>
        planCoversStay(p, checkInDate, nights)
      ) || null;

      // Price precedence: webPrice → active rate plan → baseRate.
      const nightlyRate = rt.webPrice ?? bestPlan?.nightlyRate ?? rt.baseRate;
      const maxAdults = bestPlan?.maxAdults ?? rt.capacity;
      const maxChildren = bestPlan?.maxChildren ?? 0;

      // Flexible search: filter by party size (adults/children query params).
      if (adults > maxAdults || children > maxChildren) continue;

      // Physical availability: rooms of this type free over the whole stay.
      let physicalAvailable = 0;
      for (const room of rt.rooms) {
        const isAvailable = await pricingService.checkAvailability(hotel.id, room.id, checkInDate, checkOutDate);
        if (isAvailable) physicalAvailable += 1;
      }

      // Quota logic: onlineAvailable = min(webRoomLimit - PENDING_web_reserved, physicalAvailable).
      let onlineAvailable = physicalAvailable;
      if (rt.webRoomLimit != null) {
        const pendingReserved = await prisma.bookingRoom.count({
          where: {
            roomTypeId: rt.id,
            roomId: null,
            booking: { hotelId: hotel.id, status: 'PENDING' },
            checkIn: { lt: checkOutDate },
            checkOut: { gt: checkInDate },
          },
        });
        onlineAvailable = Math.min(rt.webRoomLimit - pendingReserved, physicalAvailable);
        if (onlineAvailable < 0) onlineAvailable = 0;
      }

      if (onlineAvailable < 1) continue;

      let cancellationPolicy = null;
      if (bestPlan?.cancellationPolicyId) {
        cancellationPolicy = await prisma.cancellationPolicy.findUnique({
          where: { id: bestPlan.cancellationPolicyId },
          select: { id: true, name: true, nameAr: true, rules: true },
        });
      } else {
        const defaultPolicy = await prisma.cancellationPolicy.findFirst({
          where: { hotelId: hotel.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, nameAr: true, rules: true },
        });
        if (defaultPolicy) cancellationPolicy = defaultPolicy;
      }

      const pricing = websiteSettingsService.computeWebPricing({
        nightlyRate,
        nights,
        taxRate: websiteSettings.taxRate,
        bookingFee: websiteSettings.bookingFee,
        discountPercent: websiteSettings.discountPercent,
      });

      availability.push({
        roomType: {
          id: rt.id,
          name: rt.name,
          nameAr: rt.nameAr,
          description: rt.description,
          capacity: rt.capacity,
          images: rt.images ? JSON.parse(rt.images) : [],
        },
        availableCount: onlineAvailable,
        nightlyRate,
        ratePlanId: bestPlan?.id,
        cancellationPolicy,
        maxAdults,
        maxChildren,
        pricing,
      });
    }

    if (availability.length === 0) {
      return successResponse({
        hotel: { id: hotel.id, name: hotel.name },
        checkIn,
        checkOut,
        nights,
        availableRooms: [],
        message: 'لا توجد غرف متاحة للفترة المحددة',
      });
    }

    return successResponse({
      hotel: { id: hotel.id, name: hotel.name },
      checkIn,
      checkOut,
      nights,
      availableRooms: availability,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فحص التوفر فشل', 500);
  }
}
