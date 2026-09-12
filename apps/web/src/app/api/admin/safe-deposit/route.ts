import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createSafeDepositSchema } from '@hotel/shared';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const roomId = searchParams.get('roomId') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;
    if (roomId) where.roomId = roomId;

    const boxes = await prisma.safeDepositBox.findMany({
      where,
      include: {
        room: { select: { roomNumber: true, floor: true } },
        booking: { select: { bookingNo: true, guest: { select: { name: true } } } },
        externalClient: { select: { name: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        items: true,
      },
      orderBy: { openedAt: 'desc' },
    });

    return successResponse(boxes);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ طµظ†ط§ط¯ظٹظ‚ ط§ظ„ط£ظ…ط§ظ†ط§طھ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    if (body.roomId) {
      const room = await prisma.room.findFirst({ where: { id: body.roomId, hotelId: user.hotelId }, select: { id: true } });
      if (!room) return errorResponse('الغرفة غير موجودة', 404);
    }
    if (body.bookingId) {
      const booking = await prisma.booking.findFirst({ where: { id: body.bookingId, hotelId: user.hotelId }, select: { id: true } });
      if (!booking) return errorResponse('الحجز غير موجود', 404);
    }
    if (body.externalClientId) {
      const client = await prisma.externalClient.findFirst({ where: { id: body.externalClientId, hotelId: user.hotelId }, select: { id: true } });
      if (!client) return errorResponse('العميل الخارجي غير موجود', 404);
    }

    const box = await prisma.safeDepositBox.create({
      data: {
        hotelId: user.hotelId,
        roomId: body.roomId,
        bookingId: body.bookingId,
        externalClientId: body.externalClientId,
        notes: body.notes,
        openedById: user.userId,
        items: body?.items?.length
          ? { create: body.items.map((item: any) => ({ description: item.description, quantity: item.quantity, notes: item.notes })) }
          : undefined,
      },
      include: {
        room: { select: { roomNumber: true, floor: true } },
        openedBy: { select: { name: true } },
        items: true,
      },
    });

    return NextResponse.json({ success: true, data: box }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء صندوق الأمانات');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'ACCOUNTANT']);
export const POST = withAuth(withCsrf(withValidation(createSafeDepositSchema, postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
