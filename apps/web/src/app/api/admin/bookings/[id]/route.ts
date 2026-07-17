import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        rooms: { include: { room: true, roomCharges: true } },
        guest: true,
        folio: {
          include: {
            transactions: { orderBy: { createdAt: 'asc' } },
            payments: true,
            discounts: true,
          },
        },
        bookingServices: { include: { service: true } },
      },
    });

    if (!booking) return errorResponse('الحجز غير موجود', 404);
    if (booking.hotelId !== user.hotelId) return errorResponse('غير مصرح', 403);

    return successResponse(booking);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الحجز');
  }
}

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { rooms: true, folio: true },
    });
    if (!booking) return errorResponse('الحجز غير موجود', 404);
    if (booking.hotelId !== user.hotelId) return errorResponse('غير مصرح', 403);
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return errorResponse('لا يمكن تعديل الحجز بعد تسجيل الدخول', 400);
    }

    const oldValue = JSON.stringify({
      checkIn: booking.rooms[0]?.checkIn,
      checkOut: booking.rooms[0]?.checkOut,
      rooms: booking.rooms.map((r: any) => r.roomId),
    });

    await prisma.$transaction(async (tx) => {
      // Update dates on all booking rooms
      if (body.checkIn || body.checkOut) {
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

      // Update rooms if provided
      if (body.rooms && Array.isArray(body.rooms)) {
        // Delete existing rooms
        await tx.bookingRoom.deleteMany({ where: { bookingId: params.id } });

        // Create new rooms
        for (const r of body.rooms) {
          const room = await tx.room.findUnique({
            where: { id: r.roomId },
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

        // Recalculate folio charges if folio exists (booking was confirmed)
        if (booking.folio && booking.status === 'CONFIRMED') {
          // Clear existing room charges from folio
          const existingTx = await tx.folioTransaction.findMany({
            where: { folioId: booking.folio.id, category: 'ROOM_CHARGE' },
          });
          for (const txRecord of existingTx) {
            await tx.folioTransaction.delete({ where: { id: txRecord.id } });
          }

          // Reset folio charges/balance to service charges only
          const serviceTx = await tx.folioTransaction.findMany({
            where: { folioId: booking.folio.id, category: { not: 'ROOM_CHARGE' } },
          });
          const serviceTotal = serviceTx.reduce((sum, t) => sum + Number(t.amount), 0);
          await tx.folio.update({
            where: { id: booking.folio.id },
            data: { totalCharges: serviceTotal, balance: serviceTotal },
          });

          // Add new room charges
          for (const r of body.rooms) {
            const nights = Math.ceil(
              (new Date(body.checkOut || booking.rooms[0].checkOut).getTime() -
                new Date(body.checkIn || booking.rooms[0].checkIn).getTime()) /
                (1000 * 60 * 60 * 24),
            );
            const amount = (r.nightlyRate || 0) * nights;
            await tx.folioTransaction.create({
              data: {
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
      },
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تعديل الحجز', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const PATCH = withAuth(withCsrf(patchHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
