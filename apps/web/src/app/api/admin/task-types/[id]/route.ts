import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const existing = await prisma.taskType.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('نوع المهمة غير موجود', 404);
    const type = await prisma.taskType.update({
      where: { id: params.id },
      data: {
        name: body.name,
        nameAr: body.nameAr,
        icon: body.icon,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      },
    });
    return successResponse(type);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث نوع المهمة');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const existing = await prisma.taskType.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('نوع المهمة غير موجود', 404);
    await prisma.taskType.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حذف نوع المهمة');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
