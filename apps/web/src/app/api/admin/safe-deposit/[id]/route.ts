import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const box = await prisma.safeDepositBox.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: {
        room: { select: { roomNumber: true, floor: true } },
        booking: { select: { bookingNo: true, guest: { select: { name: true } } } },
        externalClient: { select: { name: true } },
        package: { select: { name: true, dailyPrice: true, weeklyPrice: true, monthlyPrice: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!box) return errorResponse('صندوق الأمانات غير موجود', 404);

    return successResponse(box);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب صندوق الأمانات');
  }
}

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const existing = await prisma.safeDepositBox.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('صندوق الأمانات غير موجود', 404);

    if (existing.status === 'CLOSED') return errorResponse('صندوق الأمانات مغلق بالفعل');

    const data: any = {};
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status === 'CLOSED') {
      data.status = 'CLOSED';
      data.closedAt = new Date();
      data.closedById = user.userId;
    }

    const box = await prisma.safeDepositBox.update({
      where: { id: params.id },
      data,
      include: {
        room: { select: { roomNumber: true, floor: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        items: true,
      },
    });

    return successResponse(box);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث صندوق الأمانات');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'ACCOUNTANT']);
export const PATCH = withAuth(patchHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
