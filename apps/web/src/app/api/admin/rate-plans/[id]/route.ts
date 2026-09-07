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
    if (body.nightlyRate) data.nightlyRate = body.nightlyRate;
    if (body.startDate) data.startDate = new Date(body.startDate);
    if (body.endDate) data.endDate = new Date(body.endDate);
    if (body.minStay) data.minStay = body.minStay;
    if (body.maxAdults !== undefined) data.maxAdults = body.maxAdults;
    if (body.maxChildren !== undefined) data.maxChildren = body.maxChildren;
    if (body.extraBedPrice !== undefined) data.extraBedPrice = body.extraBedPrice ? parseFloat(body.extraBedPrice) : null;
    if (body.applyDays !== undefined) data.applyDays = body.applyDays;
    if (body.cancellationPolicyId !== undefined) {
      const policy = await prisma.cancellationPolicy.findFirst({ where: { id: body.cancellationPolicyId, hotelId: user.hotelId }, select: { id: true } });
      if (!policy) return errorResponse('سياسة الإلغاء غير موجودة', 404);
      data.cancellationPolicyId = body.cancellationPolicyId;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const existing = await prisma.ratePlan.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!existing) return errorResponse('خطة السعر غير موجودة', 404);

    const plan = await prisma.ratePlan.update({
      where: { id: params.id },
      data,
      include: { roomType: true, cancellationPolicy: true },
    });

    createAuditLog({
      hotelId: plan.hotelId,
      userId: (request as any).user?.userId,
      action: 'UPDATE',
      entity: 'RATE_PLAN',
      entityId: plan.id,
      newValue: JSON.stringify({ name: plan.name, nightlyRate: plan.nightlyRate }),
    });

    return successResponse(plan);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('خطة السعر غير موجودة', 404);
    return errorResponse(error.message || 'فشل تحديث خطة السعر');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const existing = await prisma.ratePlan.findFirst({ where: { id: params.id, hotelId: user.hotelId } });
    if (!existing) return errorResponse('خطة السعر غير موجودة', 404);

    await prisma.ratePlan.delete({ where: { id: params.id } });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'DELETE',
      entity: 'RATE_PLAN',
      entityId: params.id,
    });

    return successResponse({ deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('خطة السعر غير موجودة', 404);
    return errorResponse(error.message || 'فشل حذف خطة السعر');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
