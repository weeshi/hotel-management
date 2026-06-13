import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        rooms: { include: { room: true, roomCharges: true } },
        guest: true,
        folio: {
          include: {
            transactions: { orderBy: { createdAt: 'asc' } },
            payments: true,
            discounts: true,
          },
        },
        bookingServices: { include: { service: true } },
      },
    });

    if (!booking) return errorResponse('الحجز غير موجود', 404);
    if (booking.hotelId !== user.hotelId) return errorResponse('غير مصرح', 403);

    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الحجز');
  }
}

export const GET = withAuth(getHandler);
