import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: any = {};
    if (body.name) data.name = body.name;
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.rules) data.rules = body.rules;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const policy = await prisma.cancellationPolicy.update({
      where: { id: params.id },
      data,
    });

    createAuditLog({
      hotelId: policy.hotelId,
      userId: (request as any).user?.userId,
      action: 'UPDATE',
      entity: 'CANCELLATION_POLICY',
      entityId: policy.id,
      newValue: JSON.stringify({ name: policy.name }),
    });

    return successResponse(policy);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('سياسة الإلغاء غير موجودة', 404);
    return errorResponse(error.message || 'فشل تحديث سياسة الإلغاء');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    await prisma.cancellationPolicy.delete({ where: { id: params.id } });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'DELETE',
      entity: 'CANCELLATION_POLICY',
      entityId: params.id,
    });

    return successResponse({ deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('سياسة الإلغاء غير موجودة', 404);
    return errorResponse(error.message || 'فشل حذف سياسة الإلغاء');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
