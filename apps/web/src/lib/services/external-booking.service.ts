import { prisma, tenantTx } from '@/lib/utils/prisma';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { createAuditLog, createNotification } from '@/lib/services';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

// --- Headless Booking API service (Sprint 1) ---
// Creates a booking from an external consumer (hotel site, agency, aggregator)
// authenticated by an ApiKey. Guest is resolved as a LOCAL guest of the hotel
// by idNumber -> phone -> email, otherwise created. Idempotency is guaranteed
// by Booking's @@unique([hotelId, externalRef]).

export interface ExternalGuestInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  idNumber?: string | null;
  nationality?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface ExternalRoomInput {
  roomTypeId: string;
  ratePlanId?: string | null;
  nightlyRate?: number | null;
  roomId?: string | null;
  adults?: number;
  children?: number;
}

export interface ExternalPaymentInput {
  amount?: number | null;
  currency?: string;
  method?: string;
  reference?: string;
}

export interface ExternalBookingInput {
  externalRef: string;
  checkIn: string;
  checkOut: string;
  guest: ExternalGuestInput;
  rooms: ExternalRoomInput[];
  source?: string;
  status?: string;
  payment?: ExternalPaymentInput | null;
  notes?: string;
}

export type ExternalBookingResult =
  | { status: 200 | 201; body: Record<string, any> }
  | { status: 400 | 500; body: { error: string } };

function normalizeDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class ExternalBookingService {
  async create(
    hotelId: string,
    partnerType: string,
    input: ExternalBookingInput
  ): Promise<ExternalBookingResult> {
    const checkInDate = normalizeDate(input.checkIn);
    const checkOutDate = normalizeDate(input.checkOut);

    if (!checkInDate || !checkOutDate) {
      return { status: 400, body: { error: 'تنسيق التاريخ غير صالح' } };
    }
    if (checkInDate >= checkOutDate) {
      return { status: 400, body: { error: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول' } };
    }

    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);
    if (nights < 1) {
      return { status: 400, body: { error: 'مدة الإقامة يجب أن تكون ليلة واحدة على الأقل' } };
    }

    const guest = input.guest || ({} as ExternalGuestInput);
    if (!guest.name || !String(guest.name).trim()) {
      return { status: 400, body: { error: 'اسم الضيف مطلوب' } };
    }
    if (!input.externalRef || !String(input.externalRef).trim()) {
      return { status: 400, body: { error: 'externalRef مطلوب (مفتاح تكرار الحجز)' } };
    }
    if (!input.rooms || input.rooms.length === 0) {
      return { status: 400, body: { error: 'يجب تحديد غرفة واحدة على الأقل' } };
    }

    const payment = input.payment
      ? {
          amount: Number(input.payment.amount ?? 0),
          currency: input.payment.currency || 'LYD',
          method: input.payment.method || 'EXTERNAL',
          reference: input.payment.reference || null,
        }
      : null;

    if (payment && (Number.isNaN(payment.amount) || payment.amount < 0)) {
      return { status: 400, body: { error: 'مبلغ الدفع غير صالح' } };
    }

    const sourceLabel =
      input.source ||
      (partnerType === 'HOTEL_SITE' ? 'WEBSITE' : partnerType === 'B2C_AGGREGATOR' ||
        partnerType === 'B2B_AGENCY' || partnerType === 'CHANNEL_MANAGER' ? 'PARTNER' : 'WEBSITE');
    const status = input.status || 'CONFIRMED';

    try {
      // Fast-path idempotency check (a second run after a retry).
      const existingDuplicate = await prisma.booking.findFirst({
        where: { hotelId, externalRef: input.externalRef },
        select: { id: true, bookingNo: true },
      });
      if (existingDuplicate) {
        return {
          status: 200,
          body: { received: true, duplicate: true, bookingNo: existingDuplicate.bookingNo },
        };
      }

      const bookingNo = await generateBookingNumber();

      let totalCharges = 0;

      const result = await tenantTx(async (tx) => {
        const hotel = await tx.hotel.findUnique({
          where: { id: hotelId },
          select: { currency: true },
        });
        if (!hotel) {
          throw new NotFoundError('الفندق غير موجود');
        }

        // --- Resolve/create LOCAL guest (idNumber -> phone -> email) ---
        let guestRecord = null;
        if (guest.idNumber) {
          guestRecord = await tx.guest.findFirst({
            where: { hotelId, idNumber: String(guest.idNumber).trim() },
          });
        }
        if (!guestRecord && guest.phone) {
          guestRecord = await tx.guest.findFirst({
            where: { hotelId, phone: String(guest.phone).trim() },
          });
        }
        if (!guestRecord && guest.email) {
          guestRecord = await tx.guest.findFirst({
            where: { hotelId, email: String(guest.email).trim().toLowerCase() },
          });
        }

        let guestCreated = false;
        if (!guestRecord) {
          guestRecord = await tx.guest.create({
            data: {
              hotelId,
              name: String(guest.name).trim(),
              email: guest.email ? String(guest.email).trim().toLowerCase() : null,
              phone: guest.phone ? String(guest.phone).trim() : null,
              idNumber: guest.idNumber ? String(guest.idNumber).trim() : null,
              nationality: guest.nationality || null,
              address: guest.address || null,
              notes: guest.notes || null,
            },
          });
          guestCreated = true;
        }

        // --- Validate rooms + resolve nightly rate ---
        const bookingRooms: Array<{
          roomTypeId: string;
          roomId: string | null;
          ratePlanId: string | null;
          nightlyRate: number;
          adults: number;
          children: number;
        }> = [];
        totalCharges = 0;

        for (const roomInput of input.rooms) {
          const roomType = await tx.roomType.findFirst({
            where: { id: roomInput.roomTypeId, hotelId },
          });
          if (!roomType) {
            throw new NotFoundError('نوع الغرفة غير موجود لهذا الفندق');
          }

          const adults = roomInput.adults ?? 1;
          const children = roomInput.children ?? 0;
          if (adults < 1 || adults > (roomType.capacity || 2)) {
            throw new ValidationError(
              `السعة القصوى لنوع الغرفة ${roomType.nameAr || roomType.name}: ${roomType.capacity} بالغ`
            );
          }

          let ratePlan = null;
          if (roomInput.ratePlanId) {
            ratePlan = await tx.ratePlan.findFirst({
              where: {
                id: roomInput.ratePlanId,
                roomTypeId: roomType.id,
                hotelId,
                isActive: true,
                startDate: { lte: checkInDate },
                endDate: { gte: checkOutDate },
              },
            });
            if (!ratePlan) {
              throw new ValidationError('نظام التسعير غير متاح في الفترة المحددة');
            }
          }

          const nightlyRate = Number(
            roomInput.nightlyRate ??
              ratePlan?.nightlyRate ??
              roomType.webPrice ??
              roomType.baseRate
          );
          if (Number.isNaN(nightlyRate) || nightlyRate <= 0) {
            throw new ValidationError('سعر الليلة غير صالح');
          }

          let roomId: string | null = null;
          if (roomInput.roomId) {
            const room = await tx.room.findFirst({
              where: { id: roomInput.roomId, hotelId },
            });
            if (!room) {
              throw new NotFoundError('الغرفة المحددة غير موجودة');
            }
            roomId = room.id;
          }

          bookingRooms.push({
            roomTypeId: roomType.id,
            roomId,
            ratePlanId: ratePlan?.id ?? null,
            nightlyRate,
            adults,
            children,
          });
          totalCharges += Number(nightlyRate) * nights;
        }

        // --- Create booking + rooms + folio ledger in one transaction ---
        const booking = await tx.booking.create({
          data: {
            bookingNo,
            hotelId,
            guestId: guestRecord!.id,
            guestName: guestRecord!.name,
            guestEmail: guestRecord!.email,
            guestPhone: guestRecord!.phone,
            adults: input.rooms.reduce((sum, r) => sum + (r.adults ?? 1), 0),
            children: input.rooms.reduce((sum, r) => sum + (r.children ?? 0), 0),
            status,
            source: sourceLabel,
            externalRef: input.externalRef,
            webTotalAmount: totalCharges,
            rooms: {
              create: bookingRooms.map((r) => ({
                hotelId,
                roomId: r.roomId,
                roomTypeId: r.roomTypeId,
                ratePlanId: r.ratePlanId,
                nightlyRate: r.nightlyRate,
                checkIn: checkInDate,
                checkOut: checkOutDate,
              })),
            },
          },
        });

        const folio = await tx.folio.create({
          data: { hotelId, bookingId: booking.id, totalCharges: 0, totalPaid: 0, balance: 0 },
        });

        for (const r of bookingRooms) {
          const roomAmount = Number(r.nightlyRate) * nights;
          await tx.folioTransaction.create({
            data: {
              hotelId,
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
          data: { totalCharges, balance: { increment: totalCharges } },
        });

        let paymentId: string | null = null;
        if (payment && payment.amount > 0) {
          const paymentRecord = await tx.payment.create({
            data: {
              hotelId,
              bookingId: booking.id,
              folioId: folio.id,
              amount: payment.amount,
              currency: payment.currency || hotel.currency || 'LYD',
              method: payment.method,
              gateway: sourceLabel,
              externalRef: payment.reference || input.externalRef,
              idempotencyKey: `ext_${hotelId}_${input.externalRef}`,
              status: 'SUCCEEDED',
              metadata: JSON.stringify({ partnerType, externalBookingRef: input.externalRef }),
            },
          });
          paymentId = paymentRecord.id;

          await tx.folioTransaction.create({
            data: {
              hotelId,
              folioId: folio.id,
              type: 'PAYMENT',
              category: 'PAYMENT',
              description: `دفعة إلكترونية (${sourceLabel})`,
              amount: -payment.amount,
            },
          });
          const folioAfter = await tx.folio.update({
            where: { id: folio.id },
            data: {
              totalPaid: { increment: payment.amount },
              balance: { decrement: payment.amount },
            },
          });
          if (Number(folioAfter.balance) <= 0 && folioAfter.status !== 'SETTLED') {
            await tx.folio.update({
              where: { id: folio.id },
              data: { status: 'SETTLED', settledAt: new Date() },
            });
          }
        }

        return {
          bookingId: booking.id,
          bookingNo,
          folioId: folio.id,
          paymentId,
          guestId: guestRecord!.id,
          guestCreated,
        };
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
            partnerType,
            externalRef: input.externalRef,
            guestId: result.guestId,
            totalCharges,
            paymentId: result.paymentId,
          }),
        });
        if (result.guestCreated) {
          await createAuditLog({
            hotelId,
            userId: 'external',
            action: 'CREATE',
            entity: 'GUEST',
            entityId: result.guestId,
            newValue: JSON.stringify({ externalRef: input.externalRef }),
          });
        }
        await createNotification({
          hotelId,
          bookingId: result.bookingId,
          type: 'BOOKING',
          event: 'booking.external',
          recipient: 'RECEPTION',
          subject: `حجز API خارجي #${result.bookingNo}`,
          body: `${sourceLabel} — ${guest.name}`,
        });
      } catch {
        // Non-fatal: booking already committed.
      }

      return {
        status: 201,
        body: {
          received: true,
          bookingNo: result.bookingNo,
          folioId: result.folioId,
          paymentId: result.paymentId,
          guestId: result.guestId,
          status,
        },
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Race between the fast-path check and the create => duplicate retry.
        return { status: 200, body: { received: true, duplicate: true } };
      }
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return { status: 400, body: { error: error.message } };
      }
      return { status: 500, body: { error: 'فشل إنشاء الحجز الخارجي' } };
    }
  }
}