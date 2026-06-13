import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();

async function handler(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const booking = await bookingService.checkIn(params.id);
    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تسجيل الدخول', error.statusCode || 400);
  }
}

export const POST = withAuth(handler);
