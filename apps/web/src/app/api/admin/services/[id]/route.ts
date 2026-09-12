import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.description !== undefined) data.description = body.description;
    if (body.price) data.price = body.price;
    if (body.capacityIncrease !== undefined) data.capacityIncrease = body.capacityIncrease;
    if (body.categoryId) data.categoryId = body.categoryId;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const existing = await prisma.service.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      select: { id: true },
    });
    if (!existing) return errorResponse('الخدمة غير موجودة', 404);

    const service = await prisma.service.update({
      where: { id: params.id },
      data,
      include: { category: true },
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'SERVICE',
      entityId: service.id,
      newValue: JSON.stringify({ name: service.name, price: service.price }),
    });

    return successResponse(service);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('الخدمة غير موجودة', 404);
    return errorResponse(error.message || 'فشل تحديث الخدمة');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const result = await prisma.service.deleteMany({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (result.count === 0) return errorResponse('الخدمة غير موجودة', 404);

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'DELETE',
      entity: 'SERVICE',
      entityId: params.id,
    });

    return successResponse({ deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('الخدمة غير موجودة', 404);
    return errorResponse(error.message || 'فشل حذف الخدمة');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
