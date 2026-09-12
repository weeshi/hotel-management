import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');

    const rooms = await prisma.room.findMany({
      where: {
        hotelId: user.hotelId,
        status: { notIn: ['OCCUPIED', 'MAINTENANCE'] },
        ...(checkIn && checkOut ? {
          bookingRooms: {
            none: {
              booking: {
                status: { in: ['CONFIRMED', 'CHECKED_IN'] },
              },
              checkIn: { lt: new Date(checkOut) },
              checkOut: { gt: new Date(checkIn) },
            },
          },
        } : {}),
      },
      include: { roomType: true },
      orderBy: { roomNumber: 'asc' },
    });

    return successResponse(rooms);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الغرف المتاحة');
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER', 'RECEPTION']);
