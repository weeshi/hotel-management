import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { Prisma } from '@prisma/client';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    if (!user?.hotelId) return errorResponse('ظ…ط¹ط±ظپ ط§ظ„ظپظ†ط¯ظ‚ ظ…ط·ظ„ظˆط¨', 400);
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const dateFilter = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
    const createdAtFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const walletWhere = { hotelId: user.hotelId };
    const txWhere = { wallet: walletWhere, ...createdAtFilter };

    const [walletAgg, topUpAgg, withdrawalAgg, topUpByMethod, withdrawalsByMethod, topUpByEmployee, topWallets, monthlyTrend] = await Promise.all([
      prisma.wallet.aggregate({
        where: walletWhere,
        _count: true,
        _sum: { balance: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...txWhere, type: 'DEPOSIT' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.walletTransaction.aggregate({
        where: { ...txWhere, type: 'WITHDRAWAL' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.walletTransaction.groupBy({
        by: ['method'],
        where: { ...txWhere, type: 'DEPOSIT' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.walletTransaction.groupBy({
        by: ['method'],
        where: { ...txWhere, type: 'WITHDRAWAL' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.walletTransaction.groupBy({
        by: ['createdById'],
        where: txWhere,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.walletTransaction.findMany({
        where: { wallet: walletWhere },
        include: { wallet: { include: { guest: { select: { name: true, phone: true } } } } },
        orderBy: { amount: 'desc' },
        take: 10,
      }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month', wt."createdAt")::date as month,
               SUM(CASE WHEN wt.type = 'DEPOSIT' THEN wt.amount ELSE 0 END) as deposits,
               SUM(CASE WHEN wt.type = 'WITHDRAWAL' THEN wt.amount ELSE 0 END) as withdrawals
        FROM "WalletTransaction" wt
        JOIN "Wallet" w ON wt."walletId" = w.id
        WHERE w."hotelId" = ${user.hotelId}
        ${dateFrom ? Prisma.sql`AND wt."createdAt" >= ${new Date(dateFrom)}` : Prisma.empty}
        ${dateTo ? Prisma.sql`AND wt."createdAt" <= ${new Date(dateTo)}` : Prisma.empty}
        GROUP BY month ORDER BY month ASC
      `,
    ]);

    const employeeIds = [...new Set(topUpByEmployee.map(e => e.createdById).filter(Boolean))];
    const employees = employeeIds.length
      ? await prisma.user.findMany({ where: { id: { in: employeeIds as string[] }, hotelId: user.hotelId }, select: { id: true, name: true } })
      : [];
    const employeeMap = new Map(employees.map(e => [e.id, e.name]));

    return successResponse({
      summary: {
        totalWallets: walletAgg._count,
        totalBalance: Number(walletAgg._sum.balance || 0),
        totalTopUp: Number(topUpAgg._sum?.amount || 0),
        topUpCount: topUpAgg._count,
        totalWithdrawal: Number(withdrawalAgg._sum?.amount || 0),
        withdrawalCount: withdrawalAgg._count,
        netFlow: Number(topUpAgg._sum?.amount || 0) + Number(withdrawalAgg._sum?.amount || 0),
      },
      byPaymentMethod: {
        topUp: topUpByMethod.map(m => ({ method: m.method, total: Number(m._sum?.amount || 0), count: m._count })),
        withdrawal: withdrawalsByMethod.map(m => ({ method: m.method, total: Number(m._sum.amount || 0), count: m._count })),
      },
      byEmployee: topUpByEmployee.map(e => ({
        employeeName: employeeMap.get(e.createdById || '') || 'ط§ظ„ظ†ط¸ط§ظ…',
        total: Number(e._sum.amount || 0),
        count: e._count,
      })),
      topWallets: topWallets.map(t => ({
        guestName: t.wallet.guest.name,
        guestPhone: t.wallet.guest.phone,
        type: t.type,
        amount: Number(t.amount),
        method: t.method,
        createdAt: t.createdAt,
      })),
      monthlyTrend: (monthlyTrend as any[]).map((r: any) => ({
        month: r.month,
        deposits: r.deposits || 0,
        withdrawals: r.withdrawals || 0,
      })),
    });
  } catch (error: any) {
    console.error('[WALLET REPORT]', error);
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„ظ…ط­ظپط¸ط©', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
