import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createTaskTypeSchema } from '@hotel/shared';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const types = await prisma.taskType.findMany({
      where: { hotelId: user.hotelId },
      orderBy: { sortOrder: 'asc' },
    });
    return successResponse(types);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط£ظ†ظˆط§ط¹ ط§ظ„ظ…ظ‡ط§ظ…');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const type = await prisma.taskType.create({
      data: {
        hotelId: user.hotelId,
        name: body.name,
        nameAr: body.nameAr,
        icon: body.icon,
        sortOrder: body.sortOrder || 0,
      },
    });
    return NextResponse.json({ success: true, data: type }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ظ†ظˆط¹ ط§ظ„ظ…ظ‡ظ…ط©');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withValidation(createTaskTypeSchema, postHandler)), ['ADMIN', 'MANAGER']);
