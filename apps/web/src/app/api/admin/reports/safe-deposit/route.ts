import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const createdAtFilter = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
    const where = { hotelId: user.hotelId, ...(Object.keys(createdAtFilter).length ? { openedAt: createdAtFilter } : {}) };

    const [total, byStatus, byRoom, avgDuration] = await Promise.all([
      prisma.safeDepositBox.count({ where }),
      prisma.safeDepositBox.groupBy({ by: ['status'], where, _count: true }),
      prisma.safeDepositBox.groupBy({ by: ['roomId'], where, _count: true }),
      prisma.safeDepositBox.findMany({
        where: { ...where, status: 'CLOSED', closedAt: { not: null } },
        select: { openedAt: true, closedAt: true },
      }),
    ]);

    const closedBoxes = byStatus.find(s => s.status === 'CLOSED');
    const activeBoxes = byStatus.find(s => s.status === 'ACTIVE');
    const totalDurationMs = avgDuration.reduce((s, b) => s + ((b.closedAt?.getTime() || 0) - b.openedAt.getTime()), 0);
    const avgDurationHours = avgDuration.length ? Math.round((totalDurationMs / avgDuration.length) / (1000 * 60 * 60) * 10) / 10 : 0;

    const rooms = await prisma.room.findMany({
      where: { hotelId: user.hotelId },
      select: { id: true, roomNumber: true },
    });
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.roomNumber]));

    return successResponse({
      summary: {
        total,
        active: activeBoxes?._count || 0,
        closed: closedBoxes?._count || 0,
        avgDurationHours,
      },
      byRoom: byRoom.map(r => ({ roomId: r.roomId || '', roomNumber: r.roomId ? (roomMap[r.roomId] || r.roomId) : '—', count: r._count })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± طµظ†ط§ط¯ظٹظ‚ ط§ظ„ط£ظ…ط§ظ†ط§طھ');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
