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
    const where = { hotelId: user.hotelId, ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}) };

    const [total, byStatus, byPriority, byType, byAssignee] = await Promise.all([
      prisma.housekeepingTask.count({ where }),
      prisma.housekeepingTask.groupBy({ by: ['status'], where, _count: true }),
      prisma.housekeepingTask.groupBy({ by: ['priority'], where, _count: true }),
      prisma.housekeepingTask.groupBy({ by: ['taskType'], where, _count: true }),
      prisma.housekeepingTask.groupBy({ by: ['assignedTo'], where, _count: true }),
    ]);

    const completed = byStatus.find(s => s.status === 'COMPLETED');
    const completionRate = total ? Math.round(((completed?._count || 0) / total) * 100) : 0;

    const assigneeNames = await prisma.user.findMany({
      where: { hotelId: user.hotelId, role: 'HOUSEKEEPING' },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(assigneeNames.map(u => [u.id, u.name]));

    return successResponse({
      summary: { total, completed: completed?._count || 0, pending: total - (completed?._count || 0), completionRate },
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map(p => ({ priority: p.priority, count: p._count })),
      byTaskType: byType.map(t => ({ taskType: t.taskType, count: t._count })),
      byAssignee: byAssignee.map(a => ({
        assigneeId: a.assignedTo,
        assigneeName: nameMap[a.assignedTo || ''] || a.assignedTo || 'ط؛ظٹط± ظ…ط¹ظٹظ†',
        count: a._count,
      })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„طھط¯ط¨ظٹط± ط§ظ„ظ…ظ†ط²ظ„ظٹ');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);
