import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.icon !== undefined) data.icon = body.icon;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const category = await prisma.menuCategory.update({
      where: { id: params.id },
      data,
    });
    return successResponse(category);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('التصنيف غير موجود', 404);
    return errorResponse(error.message || 'فشل تحديث التصنيف');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const count = await prisma.menuItem.count({ where: { categoryId: params.id } });
    if (count > 0) return errorResponse('لا يمكن حذف تصنيف يحتوي على عناصر', 400);

    await prisma.menuCategory.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('التصنيف غير موجود', 404);
    return errorResponse(error.message || 'فشل حذف التصنيف');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
