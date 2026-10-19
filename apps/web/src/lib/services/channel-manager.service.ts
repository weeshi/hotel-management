import { prisma, tenantTx } from '@/lib/utils/prisma';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { createNotification } from '@/lib/services';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

// --- Channel Manager / OTA service (Sprint 1 addendum) ---
// Provides:
//  1. Availability + rate snapshot generation (per RoomType per date) for push
//     to an OTA.
//  2. Inbound booking ingestion from an OTA webhook, resolving the OTA's
//     room-type/rate-plan through ChannelMapping and creating a local booking
//     (+ optional charge-only folio, since OTA usually collects payment).
// Idempotency is guaranteed by Booking's @@unique([hotelId, externalRef]).

export interface InboundBooking {
  externalRef: string;
  checkIn: string;
  checkOut: string;
  channelRoomTypeId: string;
  channelRatePlanId?: string | null;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  adults?: number;
  children?: number;
  nightlyRate?: number | null;
  paymentAmount?: number | null;
  currency?: string;
  status?: string;

  // VCC fields (optional - for tokenized virtual credit cards via VGS)
  vccTokens?: {
    cardToken: string;
    expiryToken: string;
    cvvToken: string;
    holderName: string;
  };
  vgsMetadata?: {
    vaultId?: string;
    tokenizedAt?: string;
    proxyVersion?: string;
    originalProvider: string;
  };
}

export type ChannelResult =
  | { status: 200 | 201; body: Record<string, any> }
  | { status: 400 | 404 | 500; body: { error: string } };

export class ChannelManagerService {
  /** Generate daily availability + best nightly rate for a hotel's mapped room types. */
  async buildAvailabilitySnapshot(
    hotelId: string,
    provider: string,
    from: Date,
    to: Date
  ) {
    const checkIn = new Date(from);
    const checkOut = new Date(to);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkIn >= checkOut) {
      throw new ValidationError('نطاق التواريخ غير صالح');
    }

    const mappings = await prisma.channelMapping.findMany({
      where: { hotelId, provider: provider as any, enabled: true },
      include: { roomType: true, ratePlan: true },
    });
    if (mappings.length === 0) {
      return { mappings: [], snapshots: [] };
    }
    const roomTypeIds = mappings.map((m) => m.roomTypeId);

    const rooms = await prisma.room.findMany({
      where: { hotelId, roomTypeId: { in: roomTypeIds } },
      select: { id: true, roomTypeId: true, status: true },
    });

    // Build a map of capacity per roomType (physical rooms that are AVAILABLE).
    const physicalByType: Record<string, number> = {};
    for (const room of rooms) {
      if (room.status === 'AVAILABLE') {
        physicalByType[room.roomTypeId] = (physicalByType[room.roomTypeId] || 0) + 1;
      }
    }

    // Overlapping bookings reduce availability for each date.
    const overlapped = await prisma.bookingRoom.findMany({
      where: {
        roomTypeId: { in: roomTypeIds },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
        booking: { hotelId, status: { in: ['CONFIRMED', 'PENDING'] } },
      },
      select: { roomTypeId: true, roomId: true, checkIn: true, checkOut: true },
    });

    const snapshots: Array<{
      date: Date;
      roomTypeId: string;
      available: number;
      nightlyRate: number;
    }> = [];

    for (const mapping of mappings) {
      // Gather the PENDING web reservations (roomId null) per roomType.
      const pendingReserved = await prisma.bookingRoom.groupBy({
        by: ['roomTypeId'],
        where: {
          roomTypeId: mapping.roomTypeId,
          roomId: null,
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
          booking: { hotelId, status: 'PENDING' },
        },
        _count: { id: true },
      });
      const pendCount = pendingReserved[0]?._count.id || 0;

      const rate = mapping.ratePlan?.nightlyRate ?? mapping.roomType.webPrice ?? mapping.roomType.baseRate;

      const cursor = new Date(checkIn);
      while (cursor < checkOut) {
        const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        let occupied = 0;
        for (const br of overlapped) {
          if (
            br.roomTypeId === mapping.roomTypeId &&
            br.roomId !== null &&
            br.checkIn < dayEnd &&
            br.checkOut > dayStart
          ) {
            occupied += 1;
          }
        }

        const physicalAvailable = Math.max(0, (physicalByType[mapping.roomTypeId] || 0) - occupied);
        const onlineCap = mapping.roomType.webRoomLimit ?? physicalAvailable;
        const available = Math.min(onlineCap, physicalAvailable) - pendCount;
        snapshots.push({
          date: dayStart,
          roomTypeId: mapping.roomTypeId,
          available: Math.max(0, available),
          nightlyRate: rate,
        });

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return { mappings, snapshots };
  }

  /** Persist a generated snapshot (high-watermark stream for the pusher job). */
  async storeSnapshots(hotelId: string, provider: string, snapshots: Array<{ date: Date; roomTypeId: string; available: number; nightlyRate: number }>) {
    for (const snap of snapshots) {
      await prisma.channelPriceSnapshot.upsert({
        where: {
          hotelId_provider_roomTypeId_date: {
            hotelId,
            provider: provider as any,
            roomTypeId: snap.roomTypeId,
            date: snap.date,
          },
        },
        update: { available: snap.available, nightlyRate: snap.nightlyRate },
        create: {
          hotelId,
          provider: provider as any,
          roomTypeId: snap.roomTypeId,
          date: snap.date,
          available: snap.available,
          nightlyRate: snap.nightlyRate,
        },
      });
    }
  }

  /**
   * Ingest an inbound OTA booking. Resolves the channel room-type/rate-plan to
   * the local RoomType/RatePlan via ChannelMapping, creates the booking + folio
   * (with optional charge-only payment when the OTA already charged the guest),
   * and returns the same shape as the external booking API for consistency.
   */
  async ingestInbound(
    hotelId: string,
    provider: string,
    data: InboundBooking
  ): Promise<ChannelResult> {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || nights < 1) {
      return { status: 400, body: { error: 'تواريخ الإقامة غير صالحة' } };
    }
    if (!data.externalRef || !String(data.externalRef).trim()) {
      return { status: 400, body: { error: 'externalRef مطلوب' } };
    }
    if (!data.channelRoomTypeId || !String(data.channelRoomTypeId).trim()) {
      return { status: 400, body: { error: 'channelRoomTypeId مطلوب' } };
    }

    try {
      const duplicate = await prisma.booking.findFirst({
        where: { hotelId, externalRef: data.externalRef },
        select: { id: true, bookingNo: true },
      });
      if (duplicate) {
        return { status: 200, body: { received: true, duplicate: true, bookingNo: duplicate.bookingNo } };
      }

      const mapping = await prisma.channelMapping.findFirst({
        where: {
          hotelId,
          provider: provider as any,
          channelRoomTypeId: data.channelRoomTypeId,
          enabled: true,
          ...(data.channelRatePlanId
            ? { channelRatePlanId: data.channelRatePlanId }
            : {}),
        },
        include: { roomType: true, ratePlan: true },
      });
      if (!mapping) {
        return {
          status: 400,
          body: { error: `لا يوجد ربط لنوع الغرفة ${data.channelRoomTypeId} للقناة ${provider}` },
        };
      }

      const rate = Number(
        data.nightlyRate ?? mapping.ratePlan?.nightlyRate ?? mapping.roomType.webPrice ?? mapping.roomType.baseRate
      );
      if (Number.isNaN(rate) || rate <= 0) {
        return { status: 400, body: { error: 'سعر الليلة غير صالح' } };
      }

      const bookingNo = await generateBookingNumber();

      const result = await tenantTx(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            bookingNo,
            hotelId,
            guestName: data.guestName,
            guestEmail: data.guestEmail || undefined,
            guestPhone: data.guestPhone || undefined,
            adults: data.adults ?? 1,
            children: data.children ?? 0,
            status: data.status || 'CONFIRMED',
            source: 'PARTNER',
            externalRef: data.externalRef,
            webTotalAmount: rate * nights,
            rooms: {
              create: [{
                roomTypeId: mapping!.roomTypeId,
                ratePlanId: mapping?.ratePlanId ?? undefined,
                nightlyRate: rate,
                checkIn: checkInDate,
                checkOut: checkOutDate,
              }],
            },
          },
        });

        const folio = await tx.folio.create({
          data: { hotelId, bookingId: booking.id, totalCharges: 0, totalPaid: 0, balance: 0 },
        });

        const total = Number(rate) * nights;
        await tx.folioTransaction.create({
          data: {
            hotelId,
            folioId: folio.id,
            type: 'CHARGE',
            category: 'ROOM_CHARGE',
            description: `إيجار ${nights} ليالٍ (${provider})`,
            amount: total,
          },
        });
        await tx.folio.update({
          where: { id: folio.id },
          data: { totalCharges: total, balance: { increment: total } },
        });

        let paymentId: string | null = null;
        if (data.paymentAmount && data.paymentAmount > 0) {
          const isVCC = !!data.vccTokens && !!data.vgsMetadata;
          const payment = await tx.payment.create({
            data: {
              hotelId,
              bookingId: booking.id,
              folioId: folio.id,
              amount: data.paymentAmount,
              currency: data.currency || 'LYD',
              method: isVCC ? 'VCC' : 'EXTERNAL',
              gateway: isVCC ? 'vgs' : provider,
              gatewayPaymentId: isVCC ? data.vccTokens!.cardToken : undefined,
              externalRef: data.externalRef,
              idempotencyKey: `ota_${hotelId}_${data.externalRef}`,
              status: 'SUCCEEDED',
              metadata: JSON.stringify({
                provider,
                ...(isVCC ? {
                  vccToken: data.vccTokens!.cardToken,
                  vccExpiryToken: data.vccTokens!.expiryToken,
                  vccCVVToken: data.vccTokens!.cvvToken,
                  vccProvider: data.vgsMetadata!.originalProvider || provider,
                  vgsVaultId: data.vgsMetadata!.vaultId,
                  vccHolderName: data.vccTokens!.holderName,
                  tokenizedAt: data.vgsMetadata!.tokenizedAt,
                  proxyVersion: data.vgsMetadata!.proxyVersion,
                } : {}),
              }),
              // VCC-specific fields
              ...(isVCC ? {
                vccToken: data.vccTokens!.cardToken,
                vccExpiryToken: data.vccTokens!.expiryToken,
                vccCVVToken: data.vccTokens!.cvvToken,
                vccProvider: data.vgsMetadata!.originalProvider || provider,
                vgsVaultId: data.vgsMetadata!.vaultId,
                vccHolderName: data.vccTokens!.holderName,
              } : {}),
            },
          });
          paymentId = payment.id;
          await tx.folioTransaction.create({
            data: {
              hotelId,
              folioId: folio.id,
              type: 'PAYMENT',
              category: 'PAYMENT',
              description: isVCC ? `دفعة بطاقة افتراضية (${provider})` : `دفعة إلكترونية (${provider})`,
              amount: -data.paymentAmount,
            },
          });
          const after = await tx.folio.update({
            where: { id: folio.id },
            data: {
              totalPaid: { increment: data.paymentAmount },
              balance: { decrement: data.paymentAmount },
            },
          });
          if (Number(after.balance) <= 0 && after.status !== 'SETTLED') {
            await tx.folio.update({
              where: { id: folio.id },
              data: { status: 'SETTLED', settledAt: new Date() },
            });
          }
        }

        await tx.channelMapping.update({
          where: { id: mapping!.id },
          data: { lastPushedAt: new Date() },
        });

        return { bookingId: booking.id, bookingNo, folioId: folio.id, paymentId };
      });

      try {
        await createNotification({
          hotelId,
          bookingId: result.bookingId,
          type: 'BOOKING',
          event: 'booking.channel',
          recipient: 'RECEPTION',
          subject: `حجز من قناة ${provider} #${result.bookingNo}`,
          body: `${data.guestName} — ${rate} ${data.currency || 'LYD'}`,
        });
      } catch {}

      return {
        status: 201,
        body: {
          received: true,
          bookingNo: result.bookingNo,
          folioId: result.folioId,
          paymentId: result.paymentId,
        },
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { status: 200, body: { received: true, duplicate: true } };
      }
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return { status: 400, body: { error: error.message } };
      }
      return { status: 500, body: { error: 'فشل استقبال حجز القناة' } };
    }
  }
}