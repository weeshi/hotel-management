import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
    const to = searchParams.get('to');

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);

    let toDate: Date;
    if (to) {
      toDate = new Date(to);
    } else {
      toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 14);
    }
    toDate.setHours(23, 59, 59, 999);

    const rooms = await prisma.room.findMany({
      where: { hotelId: user.hotelId },
      include: {
        roomType: { select: { id: true, name: true, nameAr: true, baseRate: true } },
      },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
    });

    const bookingRooms = await prisma.bookingRoom.findMany({
      where: {
        room: { hotelId: user.hotelId },
        checkIn: { lte: toDate },
        checkOut: { gte: fromDate },
        booking: {
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        },
      },
      include: {
        room: { select: { id: true, roomNumber: true, floor: true } },
        booking: {
          select: {
            id: true,
            bookingNo: true,
            guestName: true,
            guestPhone: true,
            status: true,
            folio: { select: { balance: true } },
          },
        },
      },
      orderBy: { checkIn: 'asc' },
    });

    return successResponse({
      rooms: rooms.map(r => ({
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor,
        status: r.status,
        housekeepingStatus: r.housekeepingStatus,
        roomType: r.roomType,
      })),
      bookingRooms: bookingRooms.map(br => ({
        id: br.id,
        bookingId: br.booking.id,
        bookingNo: br.booking.bookingNo,
        guestName: br.booking.guestName,
        guestPhone: br.booking.guestPhone,
        status: br.booking.status,
        roomId: br.roomId,
        roomNumber: br.room?.roomNumber,
        checkIn: br.checkIn,
        checkOut: br.checkOut,
        folioBalance: Number(br.booking.folio?.balance || 0),
      })),
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب بيانات المخطط الزمني', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'RECEPTION']);
