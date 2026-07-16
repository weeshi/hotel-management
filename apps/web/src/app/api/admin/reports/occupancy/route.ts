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

    const rooms = await prisma.room.findMany({
      where: { hotelId: user.hotelId },
      include: {
        roomType: true,
        bookingRooms: {
          where: {
            booking: {
              status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
              ...(dateFrom ? { createdAt: { gte: new Date(dateFrom) } } : {}),
              ...(dateTo ? { createdAt: { lte: new Date(dateTo) } } : {}),
            },
          },
          include: { booking: true },
        },
      },
    });

    const totalRooms = rooms.length;
    const totalCapacity = rooms.reduce((s, r) => s + (r.roomType?.capacity || 1), 0);
    const occupiedRooms = rooms.filter(r =>
      r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status))
    ).length;
    const roomsByType: Record<string, { total: number; occupied: number; typeName: string }> = {};
    for (const r of rooms) {
      const key = r.roomTypeId;
      if (!roomsByType[key]) roomsByType[key] = { total: 0, occupied: 0, typeName: r.roomType?.name || '' };
      roomsByType[key].total++;
      if (r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status))) roomsByType[key].occupied++;
    }

    const roomsByFloor: Record<number, { total: number; occupied: number }> = {};
    for (const r of rooms) {
      const floor = r.floor || 0;
      if (!roomsByFloor[floor]) roomsByFloor[floor] = { total: 0, occupied: 0 };
      roomsByFloor[floor].total++;
      if (r.bookingRooms.some(br => ['CONFIRMED', 'CHECKED_IN'].includes(br.booking.status))) roomsByFloor[floor].occupied++;
    }

    const avgStayDays = await prisma.bookingRoom.findMany({
      where: {
        booking: { hotelId: user.hotelId, status: 'CHECKED_OUT' },
        ...(dateFrom ? { checkIn: { gte: new Date(dateFrom) } } : {}),
        ...(dateTo ? { checkOut: { lte: new Date(dateTo) } } : {}),
      },
      select: { checkIn: true, checkOut: true },
    });

    const totalNights = avgStayDays.reduce((s, br) => {
      const nights = Math.ceil((br.checkOut.getTime() - br.checkIn.getTime()) / (1000 * 60 * 60 * 24));
      return s + Math.max(nights, 0);
    }, 0);
    const avgStay = avgStayDays.length ? (totalNights / avgStayDays.length) : 0;

    return successResponse({
      summary: {
        totalRooms,
        totalCapacity,
        occupiedRooms,
        availableRooms: totalRooms - occupiedRooms,
        occupancyPercent: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        avgStayDays: Math.round(avgStay * 10) / 10,
      },
      byRoomType: Object.entries(roomsByType).map(([id, d]) => ({ roomTypeId: id, ...d, occupancyPercent: d.total ? Math.round((d.occupied / d.total) * 100) : 0 })),
      byFloor: Object.entries(roomsByFloor).map(([floor, d]) => ({ floor: Number(floor), ...d, occupancyPercent: d.total ? Math.round((d.occupied / d.total) * 100) : 0 })),
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طھظ‚ط±ظٹط± ط§ظ„ط¥ط´ط؛ط§ظ„');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'ACCOUNTANT']);
