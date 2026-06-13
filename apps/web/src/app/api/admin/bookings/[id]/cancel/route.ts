import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const booking = await bookingService.cancel(params.id, body.reason);
    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إلغاء الحجز', error.statusCode || 400);
  }
}

export const POST = withAuth(handler);
