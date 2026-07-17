import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { Prisma } from '@prisma/client';

function generateMonthLabels(from: Date, to: Date): string[] {
  const labels: string[] = [];
  const d = new Date(from);
  while (d <= to) {
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(m);
    d.setMonth(d.getMonth() + 1);
  }
  return labels;
}

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const hotelId = user.hotelId;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const dateFilters = { day: startOfDay, week: startOfWeek, month: startOfMonth, year: startOfYear, all: new Date(0) };
    const periodStart = dateFilters[period as keyof typeof dateFilters] || startOfMonth;

    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      totalRooms,
      roomsByStatus,
      bookingsByStatus,
      totalBookings,
      periodBookings,
      todayArrivals,
      todayDepartures,
      totalPayments,
      periodPayments,
      paymentsByMethod,
      recentMonthlyBookings,
      recentMonthlyRevenue,
    ] = await Promise.all([
      prisma.room.count({ where: { hotelId } }),
      prisma.room.groupBy({ by: ['status'], where: { hotelId }, _count: true }),
      prisma.booking.groupBy({ by: ['status'], where: { hotelId }, _count: true }),
      prisma.booking.count({ where: { hotelId } }),
      prisma.booking.count({ where: { hotelId, createdAt: { gte: periodStart } } }),
      prisma.booking.count({ where: { hotelId, status: { in: ['CONFIRMED', 'CHECKED_IN'] } } }),
      prisma.booking.count({ where: { hotelId, status: 'CHECKED_IN' } }),
      prisma.payment.aggregate({ where: { booking: { hotelId }, status: 'SUCCEEDED' }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { booking: { hotelId }, status: 'SUCCEEDED', createdAt: { gte: periodStart } }, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ['method'], where: { booking: { hotelId }, status: 'SUCCEEDED' }, _sum: { amount: true }, _count: true }),
      prisma.$queryRaw(Prisma.sql`SELECT strftime('%Y-%m', createdAt) as month, COUNT(*) as count FROM Booking WHERE hotelId = ${hotelId} AND createdAt >= ${twelveMonthsAgo} GROUP BY month ORDER BY month ASC`),
      prisma.$queryRaw(Prisma.sql`SELECT strftime('%Y-%m', p.createdAt) as month, SUM(p.amount) as total FROM Payment p JOIN Booking b ON p.bookingId = b.id WHERE b.hotelId = ${hotelId} AND p.status = 'SUCCEEDED' AND p.createdAt >= ${twelveMonthsAgo} GROUP BY month ORDER BY month ASC`),
    ]);

    const occupied = roomsByStatus.find(r => r.status === 'OCCUPIED');
    const available = roomsByStatus.find(r => r.status === 'AVAILABLE');
    const maintenance = roomsByStatus.find(r => r.status === 'MAINTENANCE');
    const dirty = roomsByStatus.find(r => r.status === 'DIRTY');

    const bookingStatusMap: Record<string, number> = {};
    bookingsByStatus.forEach(b => { bookingStatusMap[b.status] = b._count; });

    const monthlyTrends = generateMonthLabels(twelveMonthsAgo, now).map(label => ({
      month: label,
      bookings: (recentMonthlyBookings as any[]).find((r: any) => r.month === label)?.count || 0,
      revenue: (recentMonthlyRevenue as any[]).find((r: any) => r.month === label)?.total || 0,
    }));

    return successResponse({
      rooms: {
        total: totalRooms,
        occupied: occupied?._count || 0,
        available: available?._count || 0,
        maintenance: maintenance?._count || 0,
        dirty: dirty?._count || 0,
        occupancyPercent: totalRooms ? Math.round(((occupied?._count || 0) / totalRooms) * 100) : 0,
      },
      bookings: {
        total: totalBookings,
        period: periodBookings,
        todayArrivals: todayArrivals,
        todayDepartures: todayDepartures,
        byStatus: bookingStatusMap,
      },
      revenue: {
        total: totalPayments._sum.amount || 0,
        period: periodPayments._sum.amount || 0,
      },
      payments: {
        byMethod: paymentsByMethod.map(p => ({
          method: p.method,
          total: p._sum.amount || 0,
          count: p._count,
        })),
      },
      trends: monthlyTrends,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„طھظ‚ط§ط±ظٹط±');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
