import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || undefined;
    const where: any = { hotelId: user.hotelId };
    if (categoryId) where.categoryId = categoryId;

    const items = await prisma.menuItem.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return successResponse(items);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط¹ظ†ط§طµط± ط§ظ„ظ‚ط§ط¦ظ…ط©');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const item = await prisma.menuItem.create({
      data: {
        hotelId: user.hotelId,
        categoryId: body.categoryId,
        name: body.name,
        nameAr: body.nameAr,
        description: body.description,
        price: body.price,
        image: body.image,
      },
      include: { category: true },
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط¹ظ†طµط± ط§ظ„ظ‚ط§ط¦ظ…ط©');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
