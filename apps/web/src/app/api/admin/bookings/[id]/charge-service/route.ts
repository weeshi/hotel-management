import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { createAuditLog, createNotification } from '@/lib/services';

const folioRepo = new FolioRepository();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const { serviceId, quantity } = body;

    if (!serviceId) return errorResponse('معرف الخدمة مطلوب', 400);

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: { folio: true },
    });
    if (!booking) return errorResponse('الحجز غير موجود', 404);

    const service = await prisma.service.findFirst({ where: { id: serviceId, hotelId: user.hotelId } });
    if (!service) return errorResponse('الخدمة غير موجودة', 404);

    const qty = quantity || 1;
    const totalPrice = service.price * qty;

    // Create BookingService record
    const bookingService = await prisma.bookingService.create({
      data: {
        bookingId: params.id,
        serviceId,
        quantity: qty,
        price: totalPrice,
      },
    });

    // If guest is checked in, charge directly to folio
    if (booking.status === 'CHECKED_IN' && booking.folio) {
      await folioRepo.addTransaction(booking.folio.id, {
        type: 'CHARGE',
        category: 'SERVICE',
        description: `خدمة: ${service.nameAr || service.name} x${qty}`,
        amount: totalPrice,
      });

      createAuditLog({
        hotelId: booking.hotelId,
        userId: user.userId,
        action: 'CHARGE',
        entity: 'FOLIO',
        entityId: booking.folio.id,
        newValue: JSON.stringify({ amount: totalPrice, description: `خدمة: ${service.nameAr || service.name}` }),
      });

      createNotification({
        hotelId: booking.hotelId,
        bookingId: params.id,
        type: 'TRANSACTION',
        event: 'folio.charge',
        recipient: 'RECEPTION',
        subject: `إضافة خدمة`,
        body: `تمت إضافة خدمة ${service.nameAr || service.name} للفاتورة بقيمة ${totalPrice.toFixed(2)} د.ل`,
      });
    }

    return successResponse(bookingService, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة الخدمة للحجز', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'RECEPTION', 'MANAGER']);
