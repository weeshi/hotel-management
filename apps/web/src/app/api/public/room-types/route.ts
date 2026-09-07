import { NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { resolveTenantFromRequest } from '@/lib/utils/tenant';

export async function GET(request: Request) {
  try {
    const hotel = await resolveTenantFromRequest(request);
    if (!hotel) {
      return errorResponse('فندق غير موجود لهذا النطاق', 404);
    }

    const types = await prisma.roomType.findMany({
      where: { 
        hotelId: hotel.id,
        isWebVisible: true
      },
      include: { _count: { select: { rooms: true } } },
      orderBy: { baseRate: 'asc' },
    });
    return successResponse(types);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب أنواع الغرف', 500);
  }
}
