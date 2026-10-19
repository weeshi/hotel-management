import { NextRequest } from 'next/server';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const booking = await prisma.booking.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: {
        rooms: { include: { room: true, roomCharges: true } },
        guest: true,
        folio: {
          include: {
            transactions: { orderBy: { createdAt: 'asc' } },
            payments: {
              select: {
                id: true,
                method: true,
                status: true,
                amount: true,
                currency: true,
                gateway: true,
                createdAt: true,
              },
            },
            discounts: true,
          },
        },
        bookingServices: { include: { service: true } },
      },
    });

    if (!booking) return errorResponse('الحجز غير موجود', 404);

    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الحجز');
  }
}

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
      include: { rooms: true, folio: true, bookingServices: true },
    });
    if (!booking) return errorResponse('الحجز غير موجود', 404);
    if (!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status)) {
      return errorResponse('لا يمكن تعديل الحجز في هذه الحالة', 400);
    }

    const isCheckedin = booking.status === 'CHECKED_IN';
    if (isCheckedin && (body.checkIn || body.checkOut || body.rooms)) {
      return errorResponse('لا يمكن تعديل التواريخ أو الغرف بعد تسجيل الدخول', 400);
    }

    const oldValue = JSON.stringify({
      checkIn: booking.rooms[0]?.checkIn,
      checkOut: booking.rooms[0]?.checkOut,
      rooms: booking.rooms.map((r: any) => r.roomId),
    });

    await tenantTx(async (tx) => {
      // Update dates on all booking rooms (only if not checked in)
      if (!isCheckedin && (body.checkIn || body.checkOut)) {
        for (const room of booking.rooms) {
          await tx.bookingRoom.update({
            where: { id: room.id },
            data: {
              ...(body.checkIn ? { checkIn: new Date(body.checkIn) } : {}),
              ...(body.checkOut ? { checkOut: new Date(body.checkOut) } : {}),
            },
          });
        }
      }

      // Update rooms if provided (only if not checked in)
      if (!isCheckedin && body.rooms && Array.isArray(body.rooms)) {
        await tx.bookingRoom.deleteMany({ where: { bookingId: params.id } });

        for (const r of body.rooms) {
          const room = await tx.room.findFirst({
            where: { id: r.roomId, hotelId: user.hotelId },
            include: { roomType: true },
          });
          if (!room) throw new Error(`الغرفة غير موجودة`);
          if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
            throw new Error(`الغرفة ${room.roomNumber} غير متاحة`);
          }
          await tx.bookingRoom.create({
            data: {
              bookingId: params.id,
              roomId: r.roomId,
              ratePlanId: r.ratePlanId,
              nightlyRate: r.nightlyRate || room.roomType.baseRate || 0,
              checkIn: body.checkIn ? new Date(body.checkIn) : booking.rooms[0].checkIn,
              checkOut: body.checkOut ? new Date(body.checkOut) : booking.rooms[0].checkOut,
            },
          });
        }

        if (booking.folio && booking.status === 'CONFIRMED') {
          const existingTx = await tx.folioTransaction.findMany({
            where: { folioId: booking.folio.id, category: 'ROOM_CHARGE' },
          });
          for (const txRecord of existingTx) {
            await tx.folioTransaction.delete({ where: { id: txRecord.id } });
          }

          const serviceTx = await tx.folioTransaction.findMany({
            where: { folioId: booking.folio.id, category: { not: 'ROOM_CHARGE' } },
          });
          const serviceTotal = serviceTx.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
          await tx.folio.update({
            where: { id: booking.folio.id },
            data: { totalCharges: serviceTotal, balance: serviceTotal },
          });

          for (const r of body.rooms) {
            const nights = Math.ceil(
              (new Date(body.checkOut || booking.rooms[0].checkOut).getTime() -
                new Date(body.checkIn || booking.rooms[0].checkIn).getTime()) /
                (1000 * 60 * 60 * 24),
            );
            const amount = (r.nightlyRate || 0) * nights;
            await tx.folioTransaction.create({
              data: {
                hotelId: booking.hotelId,
                folioId: booking.folio.id,
                type: 'CHARGE',
                category: 'ROOM_CHARGE',
                description: `إيجار غرفة - ${nights} ليالٍ`,
                amount,
              },
            });
            await tx.folio.update({
              where: { id: booking.folio.id },
              data: {
                totalCharges: { increment: amount },
                balance: { increment: amount },
              },
            });
          }
        }
      }

      // Sync services if provided
      if (body.services && Array.isArray(body.services)) {
        // Capture old service IDs for delta calculation
        const oldServiceMap: Record<string, number> = {};
        for (const bs of booking.bookingServices || []) {
          oldServiceMap[bs.serviceId] = (oldServiceMap[bs.serviceId] || 0) + bs.quantity;
        }

        // Delete existing booking services
        await tx.bookingService.deleteMany({ where: { bookingId: params.id } });

        // Resolve service prices and create new records
        const newServiceMap: Record<string, number> = {};
        for (const svc of body.services) {
          const service = await tx.service.findFirst({ where: { id: svc.serviceId, hotelId: user.hotelId } });
          if (!service) throw new Error(`الخدمة غير موجودة: ${svc.serviceId}`);

          await tx.bookingService.create({
            data: {
              bookingId: params.id,
              serviceId: svc.serviceId,
              quantity: svc.quantity,
              price: service.price * svc.quantity,
            },
          });
          newServiceMap[svc.serviceId] = (newServiceMap[svc.serviceId] || 0) + svc.quantity;
        }

        // If CHECKED_IN, post ONLY the newly added services as folio charges (Rule 2)
        if (isCheckedin && booking.folio) {
          for (const svc of body.services) {
            const oldQty = oldServiceMap[svc.serviceId] || 0;
            const addedQty = svc.quantity - oldQty;
            if (addedQty <= 0) continue;

            const service = await tx.service.findFirst({ where: { id: svc.serviceId, hotelId: user.hotelId } });
            if (!service) continue;

            const chargeAmount = service.price * addedQty;
            await tx.folioTransaction.create({
              data: {
                hotelId: booking.hotelId,
                folioId: booking.folio.id,
                type: 'CHARGE',
                category: 'SERVICE',
                description: `خدمة جديدة: ${service.nameAr || service.name} x${addedQty}`,
                amount: chargeAmount,
              },
            });
            await tx.folio.update({
              where: { id: booking.folio.id },
              data: {
                totalCharges: { increment: chargeAmount },
                balance: { increment: chargeAmount },
              },
            });
          }
        }
      }

      // Update guest info
      if (body.guestName || body.guestPhone || body.guestEmail) {
        await tx.booking.update({
          where: { id: params.id },
          data: {
            ...(body.guestName ? { guestName: body.guestName } : {}),
            ...(body.guestPhone ? { guestPhone: body.guestPhone } : {}),
            ...(body.guestEmail ? { guestEmail: body.guestEmail } : {}),
          },
        });
      }

      // Update adults/children if provided
      if (body.adults !== undefined || body.children !== undefined) {
        await tx.booking.update({
          where: { id: params.id },
          data: {
            ...(body.adults !== undefined ? { adults: body.adults } : {}),
            ...(body.children !== undefined ? { children: body.children } : {}),
          },
        });
      }
    });

    createAuditLog({
      hotelId: booking.hotelId,
      userId: user.userId,
      action: 'UPDATE',
      entity: 'BOOKING',
      entityId: params.id,
      oldValue,
      newValue: JSON.stringify(body),
    });

    const updated = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        rooms: { include: { room: true } },
        folio: true,
        bookingServices: { include: { service: true } },
      },
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تعديل الحجز', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const PATCH = withAuth(withCsrf(patchHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
