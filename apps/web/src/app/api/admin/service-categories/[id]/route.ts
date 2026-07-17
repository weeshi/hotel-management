import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const existing = await prisma.serviceCategory.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('الفئة غير موجودة', 404);
    const category = await prisma.serviceCategory.update({
      where: { id: params.id },
      data: { name: body.name, nameAr: body.nameAr, icon: body.icon, sortOrder: body.sortOrder },
    });
    return successResponse(category);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث الفئة');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const existing = await prisma.serviceCategory.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: { _count: { select: { services: true } } },
    });
    if (!existing) return errorResponse('الفئة غير موجودة', 404);
    if (existing._count.services > 0) return errorResponse('لا يمكن حذف فئة تحتوي على خدمات', 409);
    await prisma.serviceCategory.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حذف الفئة');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
