import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createRatePlanSchema } from '@hotel/shared';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const roomTypeId = searchParams.get('roomTypeId') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (roomTypeId) where.roomTypeId = roomTypeId;

    const plans = await prisma.ratePlan.findMany({
      where,
      include: { roomType: true, cancellationPolicy: true },
      orderBy: { startDate: 'asc' },
    });
    return successResponse(plans);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط®ط·ط· ط§ظ„ط£ط³ط¹ط§ط±');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const roomType = await prisma.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: user.hotelId }, select: { id: true } });
    if (!roomType) return errorResponse('نوع الغرفة غير موجود', 404);
    if (body.cancellationPolicyId) {
      const policy = await prisma.cancellationPolicy.findFirst({ where: { id: body.cancellationPolicyId, hotelId: user.hotelId }, select: { id: true } });
      if (!policy) return errorResponse('سياسة الإلغاء غير موجودة', 404);
    }

    const plan = await prisma.ratePlan.create({
      data: {
        hotelId: user.hotelId,
        roomTypeId: body.roomTypeId,
        name: body.name,
        nameAr: body.nameAr,
        nightlyRate: body.nightlyRate,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        minStay: body.minStay || 1,
        maxAdults: body.maxAdults ?? 2,
        maxChildren: body.maxChildren ?? 0,
        extraBedPrice: body.extraBedPrice ? parseFloat(body.extraBedPrice) : undefined,
        applyDays: body.applyDays,
        cancellationPolicyId: body.cancellationPolicyId,
      },
      include: { roomType: true, cancellationPolicy: true },
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'RATE_PLAN',
      entityId: plan.id,
      newValue: JSON.stringify({ name: plan.name, nightlyRate: plan.nightlyRate }),
    });

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط®ط·ط© ط§ظ„ط³ط¹ط±');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withValidation(createRatePlanSchema, postHandler)), ['ADMIN', 'MANAGER']);
