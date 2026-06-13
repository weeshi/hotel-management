import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const types = await prisma.roomType.findMany({
      where: { hotelId: user.hotelId },
      include: { _count: { select: { rooms: true } } },
      orderBy: { name: 'asc' },
    });
    return successResponse(types);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب أنواع الغرف');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const type = await prisma.roomType.create({
      data: {
        hotelId: user.hotelId,
        name: body.name || body.nameAr,
        nameAr: body.nameAr,
        description: body.description,
        baseRate: body.baseRate,
        capacity: body.capacity || 2,
        amenities: body.amenities ? JSON.stringify(body.amenities) : undefined,
      },
    });

    return NextResponse.json({ success: true, data: type }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء نوع الغرفة');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(postHandler, ['ADMIN', 'MANAGER']);
