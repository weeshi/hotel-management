import { NextRequest } from 'next/server';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const groupBookingService = new GroupBookingService();

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const group = await groupBookingService.getById(params.id);
    return successResponse(group);
  } catch (error: any) {
    return errorResponse(error.message || 'المجموعة غير موجودة', error.statusCode || 404);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
