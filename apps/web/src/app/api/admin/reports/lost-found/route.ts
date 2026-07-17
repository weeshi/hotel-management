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

    const [total, byStatus, byFoundBy, claimed] = await Promise.all([
      prisma.lostItem.count({ where }),
      prisma.lostItem.groupBy({ by: ['status'], where, _count: true }),
      prisma.lostItem.groupBy({ by: ['foundById'], where, _count: true }),
      prisma.lostItem.findMany({
        where: { ...where, status: 'CLAIMED' },
        select: { createdAt: true, claimedAt: true },
      }),
    ]);

    const pending = byStatus.find(s => s.status === 'PENDING');
    const claimedItems = byStatus.find(s => s.status === 'CLAIMED');
    const disposed = byStatus.find(s => s.status === 'DISPOSED');

    const totalRecoveryMs = claimed.reduce((s, item) => {
      if (item.claimedAt) return s + (item.claimedAt.getTime() - item.createdAt.getTime());
      return s;
    }, 0);
    const avgRecoveryHours = claimed.length ? Math.round((totalRecoveryMs / claimed.length) / (1000 * 60 * 60) * 10) / 10 : 0;

    const employees = await prisma.user.findMany({
      where: { hotelId: user.hotelId },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(employees.map(u => [u.id, u.name]));

    return successResponse({
      summary: {
        total,
        pending: pending?._count || 0,
        claimed: claimedItems?._count || 0,
        disposed: disposed?._count || 0,
        claimRate: total ? Math.round(((claimedItems?._count || 0) / total) * 100) : 0,
        avgRecoveryHours,
      },
      byFoundBy: byFoundBy.map(f => ({ employeeId: f.foundById, employeeName: nameMap[f.foundById] || f.foundById, count: f._count })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„ظ…ظپظ‚ظˆط¯ط§طھ');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
