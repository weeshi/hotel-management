import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;
    const bookingId = searchParams.get('bookingId') || undefined;

    const where: any = {};
    if (user.hotelId) {
      where.booking = { hotelId: user.hotelId };
    }
    if (status) where.status = status;
    if (bookingId) where.bookingId = bookingId;

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          booking: { select: { bookingNo: true, guestName: true } },
          refunds: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ظ…ط¯ظپظˆط¹ط§طھ');
  }
}

export const GET = withAuth(getHandler);
