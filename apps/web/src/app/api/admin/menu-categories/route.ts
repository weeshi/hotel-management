import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const categories = await prisma.menuCategory.findMany({
      where: { hotelId: user.hotelId },
      include: { _count: { select: { menuItems: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return successResponse(categories);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„طھطµظ†ظٹظپط§طھ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const category = await prisma.menuCategory.create({
      data: {
        hotelId: user.hotelId,
        name: body.name,
        nameAr: body.nameAr,
        icon: body.icon,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„طھطµظ†ظٹظپ');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
