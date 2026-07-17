import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog, createNotification } from '@/lib/services';

const bookingService = new BookingService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json().catch(() => ({}));
    const booking = await bookingService.cancel(params.id, body.reason);

    const { sendBookingNotification } = await import('@/lib/services/notification.service');
    sendBookingNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'BOOKING_CANCELLED',
      bookingNo: booking.bookingNo,
    });

    createAuditLog({
      hotelId: booking.hotelId,
      userId: user?.userId,
      action: 'CANCEL',
      entity: 'BOOKING',
      entityId: booking.id,
      newValue: JSON.stringify({ status: booking.status, reason: body.reason }),
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

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
