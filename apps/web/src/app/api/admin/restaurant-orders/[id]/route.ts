import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: {
        items: { include: { menuItem: { include: { category: true } } } },
        booking: { select: { id: true, bookingNo: true, guestName: true, folio: true } },
      },
    });
    if (!order) return errorResponse('الطلب غير موجود', 404);
    return successResponse(order);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الطلب');
  }
}

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const data: any = {};
    if (body.status) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes;

    const existing = await prisma.restaurantOrder.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      select: { id: true },
    });
    if (!existing) return errorResponse('الطلب غير موجود', 404);

    const order = await prisma.restaurantOrder.update({
      where: { id: params.id },
      data,
      include: {
        items: { include: { menuItem: { include: { category: true } } } },
        booking: { select: { id: true, bookingNo: true, guestName: true } },
      },
    });

    createAuditLog({
      hotelId: order.hotelId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'RESTAURANT_ORDER',
      entityId: order.id,
      newValue: JSON.stringify({ status: body.status, orderNo: order.orderNo }),
    });

    return successResponse(order);
  } catch (error: any) {
    if (error.code === 'P2025') return errorResponse('الطلب غير موجود', 404);
    return errorResponse(error.message || 'فشل تحديث الطلب');
  }
}

async function postChargeHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const order = await prisma.restaurantOrder.findUnique({
      where: { id: params.id },
      include: { booking: { include: { folio: true } } },
    });
    if (!order) return errorResponse('الطلب غير موجود', 404);
    if (!order.bookingId || !order.booking?.folio) return errorResponse('الحجز ليس له فاتورة نشطة', 400);

    const transaction = await prisma.folioTransaction.create({
      data: {
        folioId: order.booking.folio.id,
        type: 'CHARGE',
        category: 'SERVICE',
        description: `طلب مطعم #${order.orderNo}`,
        amount: order.totalAmount,
        createdById: user.userId,
      },
    });

    await prisma.folio.update({
      where: { id: order.booking.folio.id },
      data: {
        totalCharges: { increment: order.totalAmount },
        balance: { increment: order.totalAmount },
      },
    });

    createAuditLog({
      hotelId: order.hotelId,
      userId: user.userId,
      action: 'CHARGE',
      entity: 'FOLIO',
      entityId: order.booking.folio.id,
      newValue: JSON.stringify({ amount: order.totalAmount, description: `طلب مطعم #${order.orderNo}` }),
    });

    return successResponse(transaction, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة الرسوم للفاتورة');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
export const PUT = withAuth(withCsrf(putHandler), ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
export const POST = withAuth(withCsrf(postChargeHandler), ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
