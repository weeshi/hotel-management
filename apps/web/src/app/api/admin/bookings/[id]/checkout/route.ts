import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const booking = await bookingService.checkOut(params.id, user.userId);
    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تسجيل الخروج', error.statusCode || 400);
  }
}

export const POST = withAuth(handler);
