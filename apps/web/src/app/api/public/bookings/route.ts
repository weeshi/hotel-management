import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { resolveTenantFromRequest } from '@/lib/utils/tenant';
import { runWithTenant } from '@/lib/tenant/runtime-context';
import { BookingService } from '@/lib/services/booking.service';
import { PricingService } from '@/lib/services/pricing.service';
import { WebsiteSettingsService } from '@/lib/services/website-settings.service';
import { createNotification } from '@/lib/services/notification.service';

const bookingService = new BookingService();
const pricingService = new PricingService();
const websiteSettingsService = new WebsiteSettingsService();

export async function GET(request: NextRequest) {
  try {
    const hotel = await resolveTenantFromRequest(request);
    if (!hotel) {
      return errorResponse('فندق غير موجود لهذا النطاق', 404);
    }

    return runWithTenant({ mode: 'TENANT', hotelId: hotel.id }, async () => {
    const { searchParams } = new URL(request.url);
    const bookingNo = searchParams.get('bookingNo');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');

    if (!bookingNo) {
      return errorResponse('bookingNo مطلوب', 400);
    }
    if (!email && !phone) {
      return errorResponse('البريد الإلكتروني أو رقم الهاتف مطلوب للتحقق', 400);
    }

    const booking = await prisma.booking.findFirst({
      where: {
        hotelId: hotel.id,
        bookingNo,
        OR: [
          ...(email ? [{ guestEmail: email }] : []),
          ...(phone ? [{ guestPhone: phone }] : []),
        ],
      },
      include: {
        rooms: { include: { room: { include: { roomType: true } }, roomType: true } },
        cancellationPolicy: true,
      },
    });

    if (!booking) {
      return errorResponse('الحجز غير موجود', 404);
    }

    const firstRoom = booking.rooms[0];
    const nights = firstRoom
      ? Math.max(1, Math.ceil((firstRoom.checkOut.getTime() - firstRoom.checkIn.getTime()) / 86400000))
      : 0;
    const totalAmount = Number(booking.webTotalAmount) > 0
      ? booking.webTotalAmount
      : booking.rooms.reduce((sum, r) => sum + Number(r.nightlyRate) * nights, 0);

    return successResponse({
      bookingNo: booking.bookingNo,
      status: booking.status,
      guestName: booking.guestName,
      checkIn: firstRoom ? firstRoom.checkIn.toISOString().split('T')[0] : null,
      checkOut: firstRoom ? firstRoom.checkOut.toISOString().split('T')[0] : null,
      nights,
      adults: booking.adults,
      children: booking.children,
      totalAmount,
      webTotalAmount: booking.webTotalAmount,
      webTaxAmount: booking.webTaxAmount,
      webFeesAmount: booking.webFeesAmount,
      webDiscountAmount: booking.webDiscountAmount,
      rooms: booking.rooms.map((r) => ({
        roomNumber: r.room?.roomNumber ?? (r.roomType ? `نوع: ${r.roomType.nameAr || r.roomType.name}` : 'غير محدد'),
        roomTypeName: r.room?.roomType?.nameAr || r.roomType?.nameAr || r.room?.roomType?.name || r.roomType?.name || '',
        nightlyRate: r.nightlyRate,
      })),
      cancellationPolicy: booking.cancellationPolicy
        ? {
            id: booking.cancellationPolicy.id,
            name: booking.cancellationPolicy.name,
            nameAr: booking.cancellationPolicy.nameAr,
          }
        : null,
      createdAt: booking.createdAt,
    });
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل استرجاع الحجز', 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const hotel = await resolveTenantFromRequest(request);
    if (!hotel) {
      return errorResponse('فندق غير موجود لهذا النطاق', 404);
    }

    return runWithTenant({ mode: 'TENANT', hotelId: hotel.id }, async () => {
    const settings = await websiteSettingsService.getSettings(hotel.id);
    if (!settings.isOnlineBookingEnabled) {
      return errorResponse('الحجز عبر الموقع معطّل حالياً', 403);
    }

    const body = await request.json();

    const { roomTypeId, checkIn, checkOut, adults, children, guestName, guestEmail, guestPhone } = body;

    if (!roomTypeId || !checkIn || !checkOut) {
      return errorResponse('roomTypeId و checkIn و checkOut مطلوبان', 400);
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

    const roomType = await prisma.roomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id, isWebVisible: true },
      include: {
        rooms: { where: { status: 'AVAILABLE' }, select: { id: true } },
        ratePlans: {
          where: {
            isActive: true,
            startDate: { lte: checkInDate },
            endDate: { gte: checkOutDate },
          },
          orderBy: { nightlyRate: 'asc' },
        },
      },
    });
    if (!roomType) {
      return errorResponse('نوع الغرفة غير موجود أو غير متاح للحجز عبر الموقع', 404);
    }

    // Capacity check (rate plan overrides room type capacity).
    const bestPlan = roomType.ratePlans.find((p) => p.minStay <= nights) || null;
    const maxAdults = bestPlan?.maxAdults || roomType.capacity;
    const maxChildren = bestPlan?.maxChildren || 0;
    if ((adults || 1) > maxAdults || (children || 0) > maxChildren) {
      return errorResponse(`السعة القصوى: ${maxAdults} بالغ، ${maxChildren} طفل`, 400);
    }

    // Quota check: onlineAvailable = min(webRoomLimit - PENDING_web_reserved, physicalAvailable).
    let physicalAvailable = 0;
    for (const room of roomType.rooms) {
      const isAvailable = await pricingService.checkAvailability(hotel.id, room.id, checkInDate, checkOutDate);
      if (isAvailable) physicalAvailable += 1;
    }

    let onlineAvailable = physicalAvailable;
    if (roomType.webRoomLimit != null) {
      const pendingReserved = await prisma.bookingRoom.count({
        where: {
          roomTypeId: roomType.id,
          roomId: null,
          booking: { hotelId: hotel.id, status: 'PENDING' },
          checkIn: { lt: checkOutDate },
          checkOut: { gt: checkInDate },
        },
      });
      onlineAvailable = Math.min(roomType.webRoomLimit - pendingReserved, physicalAvailable);
      if (onlineAvailable < 0) onlineAvailable = 0;
    }

    if (onlineAvailable < 1) {
      return errorResponse('لا تتوفر سعة كافية لهذا النوع في الفترة المحددة', 409);
    }

    const nightlyRate = roomType.webPrice ?? bestPlan?.nightlyRate ?? roomType.baseRate;
    const pricing = websiteSettingsService.computeWebPricing({
      nightlyRate,
      nights,
      taxRate: settings.taxRate,
      bookingFee: settings.bookingFee,
      discountPercent: settings.discountPercent,
    });

    const booking = await bookingService.create({
      hotelId: hotel.id,
      guestName,
      guestEmail,
      guestPhone,
      adults: adults || 1,
      children: children || 0,
      checkIn,
      checkOut,
      rooms: [{
        roomTypeId: roomType.id,
        ratePlanId: bestPlan?.id,
        nightlyRate,
      }],
      source: 'WEBSITE',
      cancellationPolicyId: bestPlan?.cancellationPolicyId || undefined,
      webTaxAmount: pricing.taxAmount,
      webFeesAmount: pricing.bookingFee,
      webDiscountAmount: pricing.discountAmount,
      webTotalAmount: pricing.total,
    });

    await createNotification({
      hotelId: hotel.id,
      bookingId: booking.id,
      type: 'BOOKING_REQUEST',
      event: 'booking.request',
      recipient: 'RECEPTION',
      subject: `طلب حجز جديد #${booking.bookingNo}`,
      body: `حجز ويب جديد من ${guestName || 'ضيف'} — ${roomType.nameAr || roomType.name} — ${checkIn} إلى ${checkOut}`,
    });

    return successResponse({
      booking,
      message: 'تم إنشاء الحجز بنجاح. سيتم التواصل معكم للتأكيد.',
    }, 201);
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الحجز', 400);
  }
}
