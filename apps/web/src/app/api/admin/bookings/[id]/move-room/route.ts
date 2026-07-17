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
    const { targetRoomId, reason } = body;

    if (!targetRoomId) return errorResponse('معرف الغرفة المستهدفة مطلوب', 400);

    const updated = await bookingService.moveRoom(params.id, targetRoomId, user.userId, reason);

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل نقل الغرفة', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER', 'RECEPTION']);
