import { NextRequest, NextResponse } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { BookingRepository } from '@/lib/repositories/booking.repository';
import { withAuth } from '@/middleware/auth';
import { withValidation } from '@/middleware/validate';
import { withRateLimit } from '@/middleware/rate-limit';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';
import { createBookingSchema } from '@hotel/shared';

const bookingService = new BookingService();
const bookingRepo = new BookingRepository();

// GET /api/admin/bookings — قائمة الحجوزات
async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await bookingRepo.paginate({
      page,
      limit,
      where: { hotelId: user.hotelId, ...(status ? { status } : {}) },
      include: {
        rooms: { include: { room: true } },
        guest: true,
        folio: true,
      },
    });

    return paginatedResponse(result.data, result.total, page, limit);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الحجوزات');
  }
}

// POST /api/admin/bookings — إنشاء حجز جديد
async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const booking = await bookingService.create({
      hotelId: user.hotelId,
      ...body,
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الحجز', error.statusCode || 400);
  }
}

export const GET = withAuth(withRateLimit(getHandler));
export const POST = withAuth(withValidation(createBookingSchema, withRateLimit(postHandler)));
