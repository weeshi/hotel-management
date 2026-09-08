import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.description !== undefined) data.description = body.description;
    if (body.price) data.price = body.price;
    if (body.categoryId) {
      const category = await prisma.menuCategory.findFirst({ where: { id: body.categoryId, hotelId: user.hotelId } });
      if (!category) return errorResponse('التصنيف غير موجود', 404);
      data.categoryId = body.categoryId;
    }
    if (body.image !== undefined) data.image = body.image;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const existing = await prisma.menuItem.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!existing) return errorResponse('العنصر غير موجود', 404);

    const item = await prisma.menuItem.update({
      where: { id: params.id },
      data,
      include: { category: true },
    });
    return successResponse(item);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('العنصر غير موجود', 404);
    return errorResponse(error.message || 'فشل تحديث العنصر');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const existing = await prisma.menuItem.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!existing) return errorResponse('العنصر غير موجود', 404);

    await prisma.menuItem.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('العنصر غير موجود', 404);
    return errorResponse(error.message || 'فشل حذف العنصر');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
