import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { updateHotelCustomDomainSchema } from '@hotel/shared';
import { withPlatformAuth } from '@/middlewares/platform-auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { createAuditLog } from '@/lib/services/audit.service';

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const validated = updateHotelCustomDomainSchema.parse(body);
    const customDomain = validated.customDomain;

    const existing = await prisma.hotel.findUnique({ where: { id: params.id } });
    if (!existing) throw new NotFoundError('الفندق غير موجود');

    if (customDomain) {
      const duplicate = await prisma.hotel.findUnique({
        where: { customDomain },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== params.id) {
        throw new ValidationError('اسم النطاق مستخدم مسبقاً');
      }
    }

    const updated = await prisma.hotel.update({
      where: { id: params.id },
      data: { customDomain },
      select: { id: true, name: true, customDomain: true },
    });

    await createAuditLog({
      hotelId: params.id,
      userId: (request as any).user.userId,
      action: 'HOTEL_CUSTOM_DOMAIN_UPDATED',
      entity: 'HOTEL',
      entityId: params.id,
      oldValue: existing.customDomain ? JSON.stringify(existing.customDomain) : undefined,
      newValue: updated.customDomain ? JSON.stringify(updated.customDomain) : undefined,
    });

    return successResponse(updated);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse(error.errors.map((e: any) => e.message).join('، '), 422);
    }
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return errorResponse(error.message, error.statusCode || 400);
    }
    return errorResponse(error.message || 'فشل تحديث الفندق', 400);
  }
}

export const PATCH = withPlatformAuth(withCsrf(withRateLimit(patchHandler)));
