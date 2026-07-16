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

    const [orderStats, ordersByType, ordersByStatus, topItems, orderItems] = await Promise.all([
      prisma.restaurantOrder.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
      prisma.restaurantOrder.groupBy({ by: ['orderType'], where, _sum: { totalAmount: true }, _count: true }),
      prisma.restaurantOrder.groupBy({ by: ['status'], where, _count: true }),
      prisma.restaurantOrderItem.groupBy({
        by: ['menuItemId'],
        where: { order: where },
        _sum: { quantity: true },
        _count: true,
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      prisma.restaurantOrderItem.findMany({
        where: { order: where },
        include: { menuItem: { include: { category: true } } },
      }),
    ]);

    const categoryMap: Record<string, { total: number; count: number }> = {};
    for (const item of orderItems) {
      const catName = item.menuItem.category?.name || 'ط£ط®ط±ظ‰';
      if (!categoryMap[catName]) categoryMap[catName] = { total: 0, count: 0 };
      categoryMap[catName].total += item.price * item.quantity;
      categoryMap[catName].count += item.quantity;
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { hotelId: user.hotelId },
      select: { id: true, name: true, nameAr: true },
    });
    const itemNameMap = Object.fromEntries(menuItems.map(i => [i.id, i.nameAr || i.name]));

    return successResponse({
      summary: {
        totalOrders: orderStats._count,
        totalRevenue: orderStats._sum.totalAmount || 0,
        averageOrderValue: orderStats._count ? ((orderStats._sum.totalAmount || 0) / orderStats._count) : 0,
      },
      byOrderType: ordersByType.map(t => ({ type: t.orderType, total: t._sum.totalAmount || 0, count: t._count })),
      byStatus: ordersByStatus.map(s => ({ status: s.status, count: s._count })),
      topItems: topItems.map(i => ({
        menuItemId: i.menuItemId,
        itemName: itemNameMap[i.menuItemId] || i.menuItemId,
        quantity: i._sum.quantity || 0,
        orderCount: i._count,
      })),
      byCategory: Object.entries(categoryMap).map(([category, d]) => ({ category, total: d.total, count: d.count })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„ظ…ط·ط¹ظ…');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);
