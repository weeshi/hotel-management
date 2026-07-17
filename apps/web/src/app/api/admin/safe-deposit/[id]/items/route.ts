import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { addSafeDepositItemSchema } from '@hotel/shared';

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const box = await prisma.safeDepositBox.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!box) return errorResponse('صندوق الأمانات غير موجود', 404);
    if (box.status === 'CLOSED') return errorResponse('صندوق الأمانات مغلق، لا يمكن إضافة عناصر');

    const item = await prisma.safeDepositBoxItem.create({
      data: {
        safeDepositBoxId: params.id,
        description: body.description,
        quantity: body.quantity,
        notes: body.notes,
      },
    });

    return successResponse(item, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة العنصر');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const url = new URL(request.url);
    const itemId = url.searchParams.get('itemId');
    if (!itemId) return errorResponse('معرف العنصر مطلوب');

    const box = await prisma.safeDepositBox.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!box) return errorResponse('صندوق الأمانات غير موجود', 404);
    if (box.status === 'CLOSED') return errorResponse('صندوق الأمانات مغلق، لا يمكن حذف عناصر');

    const item = await prisma.safeDepositBoxItem.findFirst({
      where: { id: itemId, safeDepositBoxId: params.id },
    });
    if (!item) return errorResponse('العنصر غير موجود', 404);

    await prisma.safeDepositBoxItem.delete({ where: { id: itemId } });

    return successResponse({ deleted: true });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حذف العنصر');
  }
}

export const POST = withAuth(withCsrf(withValidation(addSafeDepositItemSchema, postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
