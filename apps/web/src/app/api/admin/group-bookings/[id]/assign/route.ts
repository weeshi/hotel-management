import { NextRequest } from 'next/server';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const groupBookingService = new GroupBookingService();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.bookingIds || !Array.isArray(body.bookingIds) || body.bookingIds.length === 0) {
      return errorResponse('يجب اختيار حجز واحد على الأقل', 422);
    }

    const group = await groupBookingService.assignBookings({
      groupId: params.id,
      hotelId: user.hotelId,
      bookingIds: body.bookingIds,
      createdById: user?.userId,
    });

    return successResponse(group);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة الحجوزات للمجموعة', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
