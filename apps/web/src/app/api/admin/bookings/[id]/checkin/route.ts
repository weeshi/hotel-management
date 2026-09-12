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
    const payment = body.payment && body.payment.amount > 0
      ? { method: body.payment.method || 'CASH', amount: Number(body.payment.amount) }
      : undefined;

    const booking = await bookingService.checkIn(params.id, user.hotelId, payment);

    const { sendBookingNotification } = await import('@/lib/services/notification.service');
    sendBookingNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'CHECKED_IN',
      bookingNo: booking.bookingNo,
    });

    createAuditLog({
      hotelId: booking.hotelId,
      userId: user?.userId,
      action: 'CHECK_IN',
      entity: 'BOOKING',
      entityId: booking.id,
      newValue: JSON.stringify({ status: booking.status }),
    });

    createNotification({
      hotelId: booking.hotelId,
      bookingId: booking.id,
      type: 'CHECK_IN',
      event: 'booking.checkin',
      recipient: 'RECEPTION',
      subject: `تسجيل دخول #${booking.bookingNo}`,
      body: `تم تسجيل دخول النزيل`,
    });

    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تسجيل الدخول', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
