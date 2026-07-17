import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { updateLostItemSchema } from '@hotel/shared';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const item = await prisma.lostItem.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: {
        room: { select: { roomNumber: true, floor: true } },
        foundBy: { select: { name: true } },
      },
    });

    if (!item) return errorResponse('الغرض غير موجود', 404);

    return successResponse(item);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الغرض');
  }
}

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const existing = await prisma.lostItem.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('الغرض غير موجود', 404);

    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.claimedByName !== undefined) data.claimedByName = body.claimedByName;
    if (body.claimedByIdNumber !== undefined) data.claimedByIdNumber = body.claimedByIdNumber;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status === 'CLAIMED') data.claimedAt = new Date();

    const item = await prisma.lostItem.update({
      where: { id: params.id },
      data,
      include: {
        room: { select: { roomNumber: true, floor: true } },
        foundBy: { select: { name: true } },
      },
    });

    return successResponse(item);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث الغرض');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'RESTAURANT', 'ACCOUNTANT']);
export const PATCH = withAuth(withCsrf(withValidation(updateLostItemSchema, patchHandler)), ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING']);
