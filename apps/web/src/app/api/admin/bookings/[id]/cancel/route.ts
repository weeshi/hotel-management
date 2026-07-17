import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { sendBookingNotification } from '@/lib/services/notification.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog, createNotification } from '@/lib/services';

const bookingService = new BookingService();

// GET — cancellation quote preview
async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const quote = await bookingService.getCancellationQuote(params.id);
    return successResponse(quote);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل الحصول على عرض الإلغاء', error.statusCode || 400);
  }
}

// POST — confirm cancellation with financial execution
async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json().catch(() => ({}));

    const booking = await bookingService.cancelWithRefund(params.id, user?.userId, {
      reason: body.reason,
      waivePenalty: body.waivePenalty === true,
      noShow: body.noShow === true,
    });

    if (!booking) {
      return errorResponse('الحجز غير موجود بعد الإلغاء', 404);
    }

    sendBookingNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'BOOKING_CANCELLED',
      bookingNo: booking.bookingNo,
    });

    createAuditLog({
      hotelId: booking.hotelId,
      userId: user?.userId,
      action: body.noShow ? 'NO_SHOW' : 'CANCEL',
      entity: 'BOOKING',
      entityId: booking.id,
      newValue: JSON.stringify({ status: booking.status, reason: body.reason, waivePenalty: body.waivePenalty }),
    });

    createNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'CANCELLATION',
      event: 'booking.cancelled',
      recipient: 'RECEPTION',
      subject: `إلغاء حجز #${booking.bookingNo}`,
      body: body.reason ? `السبب: ${body.reason}` : 'تم إلغاء الحجز',
    });

    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إلغاء الحجز', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
