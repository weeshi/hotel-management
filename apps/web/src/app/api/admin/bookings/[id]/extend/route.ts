import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const { newCheckOut } = body;

    if (!newCheckOut) return errorResponse('تاريخ المغادرة الجديد مطلوب', 400);

    const checkoutDate = new Date(newCheckOut);
    if (isNaN(checkoutDate.getTime())) return errorResponse('تاريخ غير صالح', 400);

    const updated = await bookingService.extendStay(params.id, user.hotelId, checkoutDate, user.userId);

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تمديد الإقامة', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
