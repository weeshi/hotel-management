import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ');
  }
}

async function putHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (body.markAll) {
      await prisma.notification.updateMany({
        where: { hotelId: user.hotelId, status: 'PENDING' },
        data: { status: 'READ', sentAt: new Date() },
      });
      return successResponse({ updated: true });
    }

    return errorResponse('ط·ظ„ط¨ ط؛ظٹط± طµط§ظ„ط­');
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ طھط­ط¯ظٹط« ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const PUT = withAuth(putHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
