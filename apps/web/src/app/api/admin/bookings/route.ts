import { NextRequest, NextResponse } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { BookingRepository } from '@/lib/repositories/booking.repository';
import { withAuth } from '@/middlewares/auth';
import { withValidation } from '@/middlewares/validate';
import { withRateLimit } from '@/middlewares/rate-limit';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';
import { createBookingSchema } from '@hotel/shared';
import { createAuditLog, createNotification } from '@/lib/services';

const bookingService = new BookingService();
const bookingRepo = new BookingRepository();

// GET /api/admin/bookings â€” ظ‚ط§ط¦ظ…ط© ط§ظ„ط­ط¬ظˆط²ط§طھ
async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, any> = { hotelId: user.hotelId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { bookingNo: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const result = await bookingRepo.paginate({
      page,
      limit,
      where,
      include: {
        rooms: { include: { room: true, roomType: true } },
        guest: true,
        folio: true,
        bookingServices: { include: { service: true } },
      },
    });

    return paginatedResponse(result.data, result.total, page, limit);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الحجوزات');
  }
}

// POST /api/admin/bookings â€” ط¥ظ†ط´ط§ط، ط­ط¬ط² ط¬ط¯ظٹط¯
async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const booking = await bookingService.create({
      hotelId: user.hotelId,
      ...body,
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'BOOKING',
      entityId: booking.id,
      newValue: JSON.stringify({ status: booking.status, guestName: body.guestName }),
    });

    const { sendBookingNotification } = await import('@/lib/services/notification.service');
    sendBookingNotification({
      hotelId: user.hotelId,
      bookingId: booking.id,
      type: 'BOOKING_CONFIRMED',
      guestEmail: body.guestEmail,
      guestName: body.guestName,
      bookingNo: booking.bookingNo,
      checkIn: body.checkIn ? new Date(body.checkIn).toLocaleDateString('ar-LY') : undefined,
      checkOut: body.checkOut ? new Date(body.checkOut).toLocaleDateString('ar-LY') : undefined,
    });

    createNotification({
      hotelId: user.hotelId,
      bookingId: booking.id,
      type: 'BOOKING_CREATED',
      event: 'booking.created',
      recipient: 'RECEPTION',
      subject: `ط­ط¬ط² ط¬ط¯ظٹط¯ #${booking.bookingNo}`,
      body: `طھظ… ط¥ظ†ط´ط§ط، ط­ط¬ط² ط¬ط¯ظٹط¯ ط¨ظˆط§ط³ط·ط© ${user.userId.slice(0, 8)}`,
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط­ط¬ط²', error.statusCode || 400);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withValidation(createBookingSchema, withRateLimit(postHandler))), ['ADMIN', 'MANAGER', 'RECEPTION']);
