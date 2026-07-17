import { NextRequest } from 'next/server';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const groupBookingService = new GroupBookingService();

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const groups = await groupBookingService.list(user.hotelId);
    return successResponse(groups);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب المجموعات', error.statusCode || 400);
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const group = await groupBookingService.create({
      name: body.name,
      hotelId: user.hotelId,
      createdById: user?.userId,
    });
    return successResponse(group, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء المجموعة', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
