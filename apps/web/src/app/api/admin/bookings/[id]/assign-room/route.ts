import { NextRequest } from 'next/server';
import { z } from 'zod';
import { BookingService } from '@/lib/services/booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();

const assignRoomSchema = z.object({
  bookingRoomId: z.string().min(1),
  roomId: z.string().min(1),
});

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const { bookingRoomId, roomId } = (request as any).validatedBody;

    const updated = await bookingService.assignPhysicalRoom({
      bookingId: params.id,
      hotelId: user.hotelId,
      bookingRoomId,
      roomId,
      userId: user.userId,
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تخصيص الغرفة', error.statusCode || 400);
  }
}

export const POST = withAuth(
  withCsrf(withValidation(assignRoomSchema, withRateLimit(handler))),
  ['ADMIN', 'MANAGER', 'RECEPTION'],
);
