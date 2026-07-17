import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const hotel = await prisma.hotel.findUnique({ where: { id: user.hotelId } });
    if (!hotel) return errorResponse('ط§ظ„ظپظ†ط¯ظ‚ ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);
    return successResponse(hotel);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظپظ†ط¯ظ‚');
  }
}

async function putHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const hotel = await prisma.hotel.update({
      where: { id: user.hotelId },
      data: {
        name: body.name,
        nameAr: body.nameAr,
        address: body.address,
        phone: body.phone,
        email: body.email,
        currency: body.currency,
        checkInTime: body.checkInTime,
        checkOutTime: body.checkOutTime,
      },
    });
    return successResponse(hotel);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ طھط­ط¯ظٹط« ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظپظ†ط¯ظ‚');
  }
}

export const GET = withAuth(getHandler, ['ADMIN']);
export const PUT = withAuth(withCsrf(putHandler), ['ADMIN']);
