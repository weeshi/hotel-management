import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity') || undefined;
    const action = searchParams.get('action') || undefined;
    const entityId = searchParams.get('entityId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = { hotelId: user.hotelId };
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (entityId) where.entityId = entityId;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { booking: { select: { bookingNo: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
