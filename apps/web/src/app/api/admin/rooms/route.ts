import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;

    const rooms = await prisma.room.findMany({
      where,
      include: {
        roomType: true,
        bookingRooms: {
          where: {
            booking: {
              status: { in: ['CONFIRMED', 'CHECKED_IN'] },
            },
          },
          include: {
            booking: {
              select: { id: true, guestName: true, checkIn: true, checkOut: true } as any,
            },
          },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });

    return successResponse(rooms);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الغرف');
  }
}

export const GET = withAuth(handler);

// POST — إنشاء غرفة جديدة
async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const room = await prisma.room.create({
      data: {
        hotelId: user.hotelId,
        roomNumber: body.roomNumber,
        floor: body.floor,
        roomTypeId: body.roomTypeId,
        notes: body.notes,
      },
      include: { roomType: true },
    });

    return NextResponse.json({ success: true, data: room }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return errorResponse('رقم الغرفة موجود مسبقاً', 409);
    }
    return errorResponse(error.message || 'فشل إنشاء الغرفة');
  }
}

export const POST = withAuth(postHandler);
