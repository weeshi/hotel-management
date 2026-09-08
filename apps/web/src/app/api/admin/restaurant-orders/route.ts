import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { createAuditLog, createNotification } from '@/lib/services';

const folioRepo = new FolioRepository();

const orderNoChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateOrderNo(): string {
  let result = 'ORD-';
  for (let i = 0; i < 6; i++) result += orderNoChars[Math.floor(Math.random() * orderNoChars.length)];
  return result;
}

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const bookingId = searchParams.get('bookingId') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;
    if (bookingId) where.bookingId = bookingId;

    const orders = await prisma.restaurantOrder.findMany({
      where,
      include: {
        items: { include: { menuItem: { include: { category: true } } } },
        booking: { select: { id: true, bookingNo: true, guestName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(orders);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ط·ظ„ط¨ط§طھ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    let orderNo = generateOrderNo();
    while (await prisma.restaurantOrder.findUnique({ where: { orderNo } })) {
      orderNo = generateOrderNo();
    }

    let totalAmount = 0;
    const itemsData = await Promise.all(
      body.items.map(async (item: any) => {
        const menuItem = await prisma.menuItem.findFirst({ where: { id: item.menuItemId, hotelId: user.hotelId } });
        if (!menuItem) throw new Error(`MenuItem ${item.menuItemId} not found`);
        const price = menuItem.price;
        totalAmount += price * item.quantity;
        return {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price,
          notes: item.notes,
        };
      })
    );

    if (body.bookingId) {
      const linkedBooking = await prisma.booking.findFirst({
        where: { id: body.bookingId, hotelId: user.hotelId },
        select: { id: true },
      });
      if (!linkedBooking) return errorResponse('الحجز غير موجود', 404);
    }

    const order = await prisma.restaurantOrder.create({
      data: {
        hotelId: user.hotelId,
        orderNo,
        bookingId: body.bookingId,
        orderType: body.orderType || 'DINE_IN',
        tableNo: body.tableNo,
        roomNo: body.roomNo,
        guestName: body.guestName,
        notes: body.notes,
        totalAmount,
        createdById: user.userId,
        items: { create: itemsData },
      },
      include: {
        items: { include: { menuItem: { include: { category: true } } } },
        booking: { select: { id: true, bookingNo: true, guestName: true } },
      },
    });

    // Auto-charge to folio if linked to a booking with active folio
    if (body.bookingId) {
      const folio = await prisma.folio.findFirst({ where: { bookingId: body.bookingId, booking: { hotelId: user.hotelId } } });
      if (folio && folio.status === 'ACTIVE') {
        await folioRepo.addTransaction(folio.id, {
          type: 'CHARGE',
          category: 'SERVICE',
          description: `ط·ظ„ط¨ ظ…ط·ط¹ظ… #${order.orderNo}`,
          amount: totalAmount,
        });
        createAuditLog({
          hotelId: user.hotelId,
          userId: user.userId,
          action: 'CHARGE',
          entity: 'FOLIO',
          entityId: folio.id,
          newValue: JSON.stringify({ amount: totalAmount, description: `ط·ظ„ط¨ ظ…ط·ط¹ظ… #${order.orderNo}` }),
        });
        createNotification({
          hotelId: user.hotelId,
          bookingId: body.bookingId,
          type: 'TRANSACTION',
          event: 'folio.charge',
          recipient: 'RECEPTION',
          subject: `ظپط§طھظˆط±ط© #${order.orderNo}`,
          body: `طھظ…طھ ط¥ط¶ط§ظپط© ${totalAmount.toFixed(2)} ط¯.ظ„ ظ„ظ„ظپط§طھظˆط±ط©`,
        });
      }
    }

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط·ظ„ط¨');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT']);
