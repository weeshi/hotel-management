import { withAuth, type AuthenticatedRequest } from '@/middlewares/auth';
import {
  executiveKpiService,
  getTripoliMonthToDateWindow,
} from '@/lib/services/executive-kpi.service';
import { AppError } from '@/lib/utils/errors';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function handler(request: AuthenticatedRequest) {
  try {
    const hotelId = request.user?.hotelId;
    if (!hotelId) return errorResponse('جلسة غير مرتبطة بفندق', 401);

    const url = new URL(request.url);
    const monthToDate = getTripoliMonthToDateWindow();

    const startDate = url.searchParams.get('startDate') ?? monthToDate.startDate;
    const endDate = url.searchParams.get('endDate') ?? monthToDate.endDate;

    const report = await executiveKpiService.getExecutiveKpis({ hotelId, startDate, endDate });
    return successResponse(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'فشل جلب مؤشرات الأداء التنفيذية';
    const status = error instanceof AppError ? error.statusCode : 400;
    return errorResponse(message, status);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
