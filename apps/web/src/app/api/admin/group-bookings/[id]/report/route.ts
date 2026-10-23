import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth, type AuthenticatedRequest } from '@/middlewares/auth';
import { AppError } from '@/lib/utils/errors';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const groupBookingService = new GroupBookingService();

async function handler(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const report = await groupBookingService.getGroupReport(params.id, hotelId);
    return successResponse(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل جلب تقرير المجموعة';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'RECEPTION', 'ACCOUNTANT']);
