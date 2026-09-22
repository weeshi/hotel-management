import { prisma, tenantTx } from '@/lib/utils/prisma';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { createAuditLog, createNotification } from '@/lib/services';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';
import type { NormalizedExternalBooking } from '@/lib/integrations/normalizers';

// --- Decoupled PMS Ledger injection (AGENTS.md §16) ---
// The external engine already collected the funds; we only record the confirmed
// booking + payment ledger. Everything runs in ONE transaction so a failure can
// never leave a half-injected booking, and the GatewayWebhook row (unique on
// provider+hotelId+eventId) makes retries idempotent.

export type InjectBookingResult =
  | {
      status: 200;
      body: { received: true; duplicate?: boolean; bookingNo?: string; folioId?: string; paymentId?: string };
    }
  | { status: 400; body: { error: string } }
  | { status: 500; body: { error: string } };

export class IntegrationService {
  async injectBooking(
    engine: string,
    hotelId: string,
    data: NormalizedExternalBooking,
    rawPayload: string
  ): Promise<InjectBookingResult> {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || nights < 1) {
      return { status: 400, body: { error: 'تواريخ الإقامة غير صالحة' } };
    }

    try {
      const bookingNo = await generateBookingNumber();

      const result = await tenantTx(async (tx) => {
        await tx.gatewayWebhook.create({
          data: {
            provider: engine,
            hotelId,
            eventId: data.externalRef,
            type: 'booking.injected',
            payload: rawPayload,
            status: 'RECEIVED',
          },
        });

        // Resolve rooms (must belong to the tenant) and fall back to the
        // room-type base rate when the engine did not send a nightly rate.
        const bookingRooms: Array<{ roomId: string; nightlyRate: number }> = [];
        let totalCharges = 0;
        for (const roomData of data.rooms) {
          const room = await tx.room.findFirst({
            where: { id: roomData.roomId, hotelId },
            include: { roomType: true },
          });
          if (!room) {
            throw new NotFoundError('الغرفة غير موجودة');
          }
          const nightlyRate = roomData.nightlyRate ?? room.roomType.baseRate;
          bookingRooms.push({ roomId: room.id, nightlyRate });
          totalCharges += Number(nightlyRate) * nights;
        }

        const booking = await tx.booking.create({
          data: {
            bookingNo,
            hotelId,
            guestName: data.guestName,
            guestEmail: data.guestEmail || undefined,
            guestPhone: data.guestPhone,
            adults: data.adults,
            children: data.children,
            source: 'WEBSITE',
            status: 'CONFIRMED',
            externalRef: data.externalRef,
            rooms: {
              create: bookingRooms.map((r) => ({
                roomId: r.roomId,
                nightlyRate: r.nightlyRate,
                checkIn: checkInDate,
                checkOut: checkOutDate,
              })),
            },
          },
        });

        const folio = await tx.folio.create({
          data: { bookingId: booking.id, totalCharges: 0, totalPaid: 0, balance: 0 },
        });

        for (const room of bookingRooms) {
          const roomAmount = Number(room.nightlyRate) * nights;
          await tx.folioTransaction.create({
            data: {
              folioId: folio.id,
              type: 'CHARGE',
              category: 'ROOM_CHARGE',
              description: `إيجار ${nights} ليالٍ`,
              amount: roomAmount,
            },
          });
        }
        await tx.folio.update({
          where: { id: folio.id },
          data: { totalCharges: totalCharges, balance: { increment: totalCharges } },
        });

        const payment = await tx.payment.create({
          data: {
            hotelId,
            bookingId: booking.id,
            folioId: folio.id,
            amount: data.payment.amount,
            currency: data.payment.currency,
            method: data.payment.method.toUpperCase(),
            gateway: engine,
            externalRef: data.payment.reference || data.externalRef,
            idempotencyKey: `ext_${engine}_${hotelId}_${data.externalRef}`,
            status: 'SUCCEEDED',
            metadata: JSON.stringify({
              engine,
              externalBookingRef: data.externalRef,
              reference: data.payment.reference,
            }),
          },
        });

        await tx.folioTransaction.create({
          data: {
            folioId: folio.id,
            type: 'PAYMENT',
            category: 'PAYMENT',
            description: `دفعة إلكترونية (${engine})`,
            amount: -data.payment.amount,
          },
        });

        const folioAfterPayment = await tx.folio.update({
          where: { id: folio.id },
          data: {
            totalPaid: { increment: data.payment.amount },
            balance: { decrement: data.payment.amount },
          },
        });

        if (Number(folioAfterPayment.balance) <= 0 && folioAfterPayment.status !== 'SETTLED') {
          await tx.folio.update({
            where: { id: folio.id },
            data: { status: 'SETTLED', settledAt: new Date() },
          });
        }

        await tx.gatewayWebhook.updateMany({
          where: { provider: engine, hotelId, eventId: data.externalRef, status: 'RECEIVED' },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });

        return { bookingId: booking.id, bookingNo, folioId: folio.id, paymentId: payment.id };
      });

      // Side effects after commit — non-fatal.
      try {
        await createAuditLog({
          hotelId,
          userId: 'external',
          action: 'CREATE',
          entity: 'BOOKING',
          entityId: result.bookingId,
          newValue: JSON.stringify({
            engine,
            externalRef: data.externalRef,
            paymentAmount: data.payment.amount,
            paymentCurrency: data.payment.currency,
          }),
        });

        await createNotification({
          hotelId,
          bookingId: result.bookingId,
          type: 'BOOKING',
          event: 'booking.injected',
          recipient: 'RECEPTION',
          subject: `حجز خارجي مؤكد #${result.bookingNo}`,
          body: `${data.payment.amount} ${data.payment.currency} - ${engine}`,
        });
      } catch {
        // Non-fatal: injection already committed.
      }

      return {
        status: 200,
        body: {
          received: true,
          bookingNo: result.bookingNo,
          folioId: result.folioId,
          paymentId: result.paymentId,
        },
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Unique (provider, hotelId, eventId) or (hotelId, externalRef)
        // violation => this booking was already injected.
        return { status: 200, body: { received: true, duplicate: true } };
      }
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return { status: 400, body: { error: error.message } };
      }
      return { status: 500, body: { error: 'Booking injection failed' } };
    }
  }
}
