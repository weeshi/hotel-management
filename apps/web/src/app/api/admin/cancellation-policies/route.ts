import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createCancellationPolicySchema } from '@hotel/shared';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const policies = await prisma.cancellationPolicy.findMany({
      where: { hotelId: user.hotelId },
      include: { _count: { select: { ratePlans: true } } },
      orderBy: { name: 'asc' },
    });
    return successResponse(policies);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط³ظٹط§ط³ط§طھ ط§ظ„ط¥ظ„ط؛ط§ط،');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const policy = await prisma.cancellationPolicy.create({
      data: {
        hotelId: user.hotelId,
        name: body.name,
        nameAr: body.nameAr,
        rules: body.rules,
      },
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'CANCELLATION_POLICY',
      entityId: policy.id,
      newValue: JSON.stringify({ name: policy.name }),
    });

    return NextResponse.json({ success: true, data: policy }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط³ظٹط§ط³ط© ط§ظ„ط¥ظ„ط؛ط§ط،');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withValidation(createCancellationPolicySchema, postHandler)), ['ADMIN', 'MANAGER']);
