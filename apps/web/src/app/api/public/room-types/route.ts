import { NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

export async function GET() {
  try {
    const types = await prisma.roomType.findMany({
      where: { hotelId: 'default-hotel' },
      include: { _count: { select: { rooms: true } } },
      orderBy: { baseRate: 'asc' },
    });
    return successResponse(types);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط£ظ†ظˆط§ط¹ ط§ظ„ط؛ط±ظپ');
  }
}
