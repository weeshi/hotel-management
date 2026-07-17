import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { Prisma } from '@prisma/client';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const dateFilter = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
    const createdAtFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [paymentAgg, folioCharges, discounts, monthlyRevenue] = await Promise.all([
      prisma.payment.aggregate({
        where: { booking: { hotelId: user.hotelId }, status: 'SUCCEEDED', ...createdAtFilter },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.folioTransaction.aggregate({
        where: { folio: { booking: { hotelId: user.hotelId } }, type: 'CHARGE', ...createdAtFilter },
        _sum: { amount: true, taxAmount: true },
        _count: true,
      }),
      prisma.folioDiscount.aggregate({
        where: { folio: { booking: { hotelId: user.hotelId } }, ...createdAtFilter },
        _sum: { amount: true },
      }),
      prisma.$queryRaw(Prisma.sql`
        SELECT strftime('%Y-%m', p.createdAt) as month, SUM(p.amount) as total
        FROM Payment p JOIN Booking b ON p.bookingId = b.id
        WHERE b.hotelId = ${user.hotelId} AND p.status = 'SUCCEEDED'
        ${dateFrom ? Prisma.sql`AND p.createdAt >= ${new Date(dateFrom)}` : Prisma.empty}
        ${dateTo ? Prisma.sql`AND p.createdAt <= ${new Date(dateTo)}` : Prisma.empty}
        GROUP BY month ORDER BY month ASC
      `),
    ]);

    const paymentsByMethod = await prisma.payment.groupBy({
      by: ['method'],
      where: { booking: { hotelId: user.hotelId }, status: 'SUCCEEDED', ...createdAtFilter },
      _sum: { amount: true },
      _count: true,
    });

    const chargesByCategory = await prisma.folioTransaction.groupBy({
      by: ['category'],
      where: { folio: { booking: { hotelId: user.hotelId } }, type: 'CHARGE', ...createdAtFilter },
      _sum: { amount: true },
      _count: true,
    });

    return successResponse({
      summary: {
        totalRevenue: paymentAgg._sum.amount || 0,
        totalCharges: folioCharges._sum.amount || 0,
        totalTax: folioCharges._sum.taxAmount || 0,
        totalDiscounts: discounts._sum.amount || 0,
        netRevenue: (paymentAgg._sum.amount || 0) - (discounts._sum.amount || 0),
        paymentCount: paymentAgg._count,
      },
      byPaymentMethod: paymentsByMethod.map(p => ({ method: p.method, total: p._sum.amount || 0, count: p._count })),
      byCategory: chargesByCategory.map(c => ({ category: c.category, total: c._sum.amount || 0, count: c._count })),
      monthlyTrend: (monthlyRevenue as any[]).map((r: any) => ({ month: r.month, revenue: r.total || 0 })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
