import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createServiceSchema } from '@hotel/shared';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (categoryId) where.categoryId = categoryId;

    const services = await prisma.service.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return successResponse(services);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ط®ط¯ظ…ط§طھ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const service = await prisma.service.create({
      data: {
        hotelId: user.hotelId,
        categoryId: body.categoryId,
        name: body.name,
        nameAr: body.nameAr,
        description: body.description,
        price: body.price,
        isActive: body.isActive ?? true,
      },
      include: { category: true },
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CREATE',
      entity: 'SERVICE',
      entityId: service.id,
      newValue: JSON.stringify({ name: service.name, price: service.price }),
    });

    return NextResponse.json({ success: true, data: service }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط®ط¯ظ…ط©');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withValidation(createServiceSchema, postHandler)), ['ADMIN', 'MANAGER']);
