import { NextRequest } from 'next/server';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const groupBookingService = new GroupBookingService();

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.rules || !Array.isArray(body.rules)) {
      return errorResponse('يجب تحديد قواعد التوجيه', 422);
    }

    const group = await groupBookingService.setRoutingRules(
      params.id,
      user.hotelId,
      body.rules,
      user?.userId,
    );

    return successResponse(group);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث قواعد التوجيه', error.statusCode || 400);
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
