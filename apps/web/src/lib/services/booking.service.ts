import { prisma, tenantTx } from '@/lib/utils/prisma';
import { Prisma } from '@prisma/client';
import { generateBookingNumber } from '@/lib/utils/booking-number';
import { BookingRepository } from '@/lib/repositories/booking.repository';
import { FolioRepository } from '@/lib/repositories/folio.repository';
import { PricingService } from '@/lib/services/pricing.service';
import { GuestService } from '@/lib/services/guest.service';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const bookingRepo = new BookingRepository();
const folioRepo = new FolioRepository();
const pricingService = new PricingService();

export class BookingService {
  async create(data: {
    hotelId: string;
    guestId?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    adults: number;
    children: number;
    checkIn: string;
    checkOut: string;
    rooms: Array<{
      roomId?: string;
      roomTypeId?: string;
      ratePlanId?: string;
      nightlyRate?: number;
    }>;
    services?: Array<{ serviceId: string; quantity: number }>;
    source?: string;
    cancellationPolicyId?: string;
    webTaxAmount?: number;
    webFeesAmount?: number;
    webDiscountAmount?: number;
    webTotalAmount?: number;
  }) {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);

    if (nights < 1) throw new ValidationError('مدة الإقامة يجب أن تكون ليلة واحدة على الأقل');

    const bookingRooms: Array<{
      roomId: string | null;
      roomTypeId?: string;
      ratePlanId?: string;
      nightlyRate: number;
      checkIn: Date;
      checkOut: Date;
    }> = [];

    let cancellationPolicyId = data.cancellationPolicyId;

    for (const roomData of data.rooms) {
      // Web booking without a physical room: reserve by room type only (roomId stays null).
      if (!roomData.roomId) {
        if (!roomData.roomTypeId) throw new ValidationError('يجب تحديد غرفة أو نوع غرفة');

        const roomType = await prisma.roomType.findFirst({
          where: { id: roomData.roomTypeId, hotelId: data.hotelId },
        });
        if (!roomType) throw new NotFoundError('نوع الغرفة غير موجود');

        let ratePlanId = roomData.ratePlanId;
        if (!ratePlanId) {
          const activePlan = await prisma.ratePlan.findFirst({
            where: {
              hotelId: data.hotelId,
              roomTypeId: roomType.id,
              isActive: true,
              startDate: { lte: checkInDate },
              endDate: { gte: checkOutDate },
              OR: [{ minStay: { lte: nights } }],
            },
            orderBy: { nightlyRate: 'asc' },
          });
          if (activePlan) {
            ratePlanId = activePlan.id;
            if (activePlan.cancellationPolicyId) {
              cancellationPolicyId = activePlan.cancellationPolicyId;
            }
          }
        }

        bookingRooms.push({
          roomId: null,
          roomTypeId: roomType.id,
          ratePlanId,
          nightlyRate: roomData.nightlyRate ?? roomType.webPrice ?? roomType.baseRate,
          checkIn: checkInDate,
          checkOut: checkOutDate,
        });
        continue;
      }

      const room = await prisma.room.findFirst({
        where: { id: roomData.roomId, hotelId: data.hotelId },
        include: { roomType: true },
      });
      if (!room) throw new NotFoundError(`الغرفة غير موجودة`);
      if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
        throw new ValidationError(`الغرفة ${room.roomNumber} غير متاحة`);
      }

      let nightlyRate = roomData.nightlyRate;
      let ratePlanId = roomData.ratePlanId;

      if (!nightlyRate || !ratePlanId) {
        const ratePlan = await pricingService.findBestRatePlan(
          data.hotelId, room.roomTypeId, room.id, checkInDate, checkOutDate,
        );

        if (ratePlan) {
          if (ratePlan.minStay > nights) {
            throw new ValidationError(
              `خطة السعر "${ratePlan.ratePlanId}" تتطلب ${ratePlan.minStay} ليالٍ كحد أدنى`,
            );
          }
          nightlyRate = ratePlan.nightlyRate;
          ratePlanId = ratePlan.ratePlanId;
          if (ratePlan.cancellationPolicyId) {
            cancellationPolicyId = ratePlan.cancellationPolicyId;
          }
        } else {
          nightlyRate = room.roomType.baseRate;
        }
      }

      bookingRooms.push({
        roomId: roomData.roomId,
        roomTypeId: room.roomTypeId,
        ratePlanId,
        nightlyRate: nightlyRate || room.roomType.baseRate,
        checkIn: checkInDate,
        checkOut: checkOutDate,
      });
    }

    if (!data.guestId && data.guestName) {
      const guestService = new GuestService();
      const guest = await guestService.findOrCreateFromBooking({
        name: data.guestName,
        email: data.guestEmail,
        phone: data.guestPhone,
      }, data.hotelId);
      data.guestId = guest.id;
    }

    const bookingNo = await generateBookingNumber();
    const isReception = data.source === 'RECEPTION';

    // Resolve services with their prices before the transaction
    const servicesWithPrice: Array<{ serviceId: string; quantity: number; price: number }> = [];
    if (data.services && data.services.length > 0) {
      for (const svc of data.services) {
        const service = await prisma.service.findFirst({ where: { id: svc.serviceId, hotelId: data.hotelId } });
        if (service) {
          servicesWithPrice.push({ ...svc, price: service.price * svc.quantity });
        }
      }
    }

    const booking = await tenantTx(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingNo,
          hotelId: data.hotelId,
          guestId: data.guestId,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestPhone: data.guestPhone,
          adults: data.adults,
          children: data.children,
          source: (data.source as any) || 'WEBSITE',
          status: 'PENDING',
          cancellationPolicyId: cancellationPolicyId || undefined,
          webTaxAmount: data.webTaxAmount ?? 0,
          webFeesAmount: data.webFeesAmount ?? 0,
          webDiscountAmount: data.webDiscountAmount ?? 0,
          webTotalAmount: data.webTotalAmount ?? 0,
          rooms: {
            create: bookingRooms.map((r) => ({
              hotelId: data.hotelId,
              roomId: r.roomId,
              roomTypeId: r.roomTypeId,
              ratePlanId: r.ratePlanId,
              nightlyRate: r.nightlyRate,
              checkIn: r.checkIn,
              checkOut: r.checkOut,
            })),
          },
        },
        include: { rooms: { include: { room: true } } },
      });

      // Create folio if reception booking
      if (isReception) {
        const folio = await tx.folio.create({
          data: {
            hotelId: data.hotelId,
            bookingId: created.id,
            totalCharges: 0,
            totalPaid: 0,
            balance: 0,
          },
        });

        // Add room charges as folio transactions at creation time
        for (let ri = 0; ri < bookingRooms.length; ri++) {
          const roomData = bookingRooms[ri];
          const roomNights = Math.ceil(
            (roomData.checkOut.getTime() - roomData.checkIn.getTime()) / 86400000
          );
          await tx.folioTransaction.create({
            data: {
              hotelId: data.hotelId,
              folioId: folio.id,
              type: 'CHARGE',
              category: 'ROOM_CHARGE',
              description: `إيجار ${created.rooms[ri]?.room?.roomNumber || roomData.roomId} - ${roomNights} ليالٍ`,
              amount: Number(roomData.nightlyRate) * roomNights,
            },
          });
          await tx.folio.update({
            where: { id: folio.id },
            data: {
              totalCharges: { increment: Number(roomData.nightlyRate) * roomNights },
              balance: { increment: Number(roomData.nightlyRate) * roomNights },
            },
          });
        }

        // Add service charges as folio transactions
        for (const svc of servicesWithPrice) {
          const service = await tx.service.findFirst({ where: { id: svc.serviceId, hotelId: data.hotelId } });
          if (service) {
            await tx.bookingService.create({
              data: {
                hotelId: data.hotelId,
                bookingId: created.id,
                serviceId: svc.serviceId,
                quantity: svc.quantity,
                price: svc.price,
              },
            });
            await tx.folioTransaction.create({
              data: {
                hotelId: data.hotelId,
                folioId: folio.id,
                type: 'CHARGE',
                category: 'SERVICE',
                description: `${service.nameAr || service.name} x${svc.quantity}`,
                amount: svc.price,
              },
            });
            await tx.folio.update({
              where: { id: folio.id },
              data: {
                totalCharges: { increment: svc.price },
                balance: { increment: svc.price },
              },
            });
          }
        }
      } else {
        // For non-reception bookings, just create BookingService records
        for (const svc of servicesWithPrice) {
          await tx.bookingService.create({
            data: {
              hotelId: data.hotelId,
              bookingId: created.id,
              serviceId: svc.serviceId,
              quantity: svc.quantity,
              price: svc.price,
            },
          });
        }
      }

      if (isReception) {
        return tx.booking.update({
          where: { id: created.id },
          data: { status: 'CONFIRMED' },
        });
      }

      return created;
    });

    return booking;
  }

  async confirm(bookingId: string, hotelId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' },
    });

    return updated;
  }

  async checkIn(bookingId: string, hotelId: string, payment?: { method: string; amount: number }) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: { rooms: { include: { room: true } }, guest: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CONFIRMED') {
      throw new ValidationError('يجب تأكيد الحجز أولاً');
    }

    const earliestCheckIn = booking.rooms.reduce(
      (earliest, r) => (r.checkIn < earliest ? r.checkIn : earliest),
      booking.rooms[0].checkIn,
    );
    if (new Date() < earliestCheckIn) {
      throw new ValidationError(
        'لا يمكن تسجيل الدخول قبل تاريخ الوصول المحدد. قم بتعديل الحجز لتغيير تاريخ البداية',
      );
    }

    const folio = await prisma.folio.findFirst({
      where: { bookingId },
    });
    if (!folio) throw new NotFoundError('الفاتورة غير موجودة للحجز');

    return tenantTx(async (tx) => {
      // --- Charges are already posted at booking creation time (create()). ---
      // checkIn() ONLY: occupies rooms, records payment, deducts wallet, updates status.

      // 1. Set room statuses to OCCUPIED
      for (const room of booking.rooms) {
        if (!room.roomId) continue; // Skip web bookings without assigned room
        await tx.room.update({
          where: { id: room.roomId },
          data: { status: 'OCCUPIED' },
        });
      }

      // 2. Record payment if provided
      if (payment && payment.amount > 0) {
        await tx.payment.create({
          data: {
            hotelId,
            bookingId,
            folioId: folio.id,
            amount: payment.amount,
            method: payment.method,
            currency: 'LYD',
            gateway: payment.method.toLowerCase(),
            gatewayPaymentId: `checkin_${crypto.randomUUID()}`,
            idempotencyKey: crypto.randomUUID(),
            status: 'SUCCEEDED',
          },
        });

        await tx.folioTransaction.create({
          data: {
            hotelId: booking.hotelId,
            folioId: folio.id,
            type: 'PAYMENT',
            category: 'PAYMENT',
            description: `دفعة مسبقة — ${payment.method}`,
            amount: -payment.amount,
          },
        });

        await tx.folio.update({
          where: { id: folio.id },
          data: {
            totalPaid: { increment: payment.amount },
            balance: { decrement: payment.amount },
          },
        });

        // 3. Deduct from wallet if WALLET method
        if (payment.method === 'WALLET' && booking.guestId) {
          const wallet = await tx.wallet.findUnique({
            where: { guestId_hotelId: { guestId: booking.guestId, hotelId: booking.hotelId } },
          });
          if (wallet) {
            const deduction = new Prisma.Decimal(payment.amount);
            const balanceBefore = wallet.balance;
            const balanceAfter = balanceBefore.sub(deduction);

            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: balanceAfter },
            });
            await tx.walletTransaction.create({
              data: {
                hotelId: booking.hotelId,
                walletId: wallet.id,
                type: 'PAYMENT',
                amount: deduction,
                balanceBefore,
                balanceAfter,
                description: `تسجيل دخول حجز #${booking.bookingNo}`,
                referenceId: booking.id,
                method: 'WALLET',
                status: 'COMPLETED',
              },
            });
          }
        }
      }

      // 4. Update booking status
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_IN' },
      });
    });
  }

  async checkOut(bookingId: string, hotelId: string, settledById: string): Promise<{ booking: any; folioBalance: number }> {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: { include: { room: true } },
        folio: true,
        cancellationPolicy: true,
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') {
      throw new ValidationError('النزيل ليس في إقامة نشطة');
    }

    const preBalance = booking.folio ? Number(booking.folio.balance) : 0;
    if (preBalance > 0) {
      throw new ValidationError(
        `لا يمكن تسجيل الخروج. يوجد مبلغ متبقي بقيمة ${preBalance.toFixed(2)} د.ل. يجب سداد الفاتورة أولاً.`
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tenantTx(async (tx) => {
      let refundPct = 100;
      if (booking.cancellationPolicy) {
        try {
          const rules = JSON.parse(booking.cancellationPolicy.rules);
          const tiers = Array.isArray(rules) ? rules : [rules];
          if (tiers.length > 0) {
            const bestTier = tiers.reduce(
              (max: any, t: any) =>
                (t.refundPercentage || 0) > (max?.refundPercentage || 0) ? t : max,
              null,
            );
            refundPct = bestTier ? bestTier.refundPercentage || 0 : 0;
          }
        } catch {
          refundPct = 100;
        }
      }

      for (const room of booking.rooms) {
        const roomCheckOut = new Date(room.checkOut);
        roomCheckOut.setHours(0, 0, 0, 0);
        if (roomCheckOut <= today) continue;

        const roomCheckIn = new Date(room.checkIn);
        roomCheckIn.setHours(0, 0, 0, 0);

        const totalNights = Math.round(
          (roomCheckOut.getTime() - roomCheckIn.getTime()) / 86400000,
        );
        const usedNights = Math.max(
          1,
          Math.round((today.getTime() - roomCheckIn.getTime()) / 86400000),
        );
        const unusedNights = totalNights - usedNights;
        if (unusedNights <= 0) continue;

        const nightlyRate = Number(room.nightlyRate);
        const roomRefund = (nightlyRate * unusedNights * refundPct) / 100;

        if (roomRefund > 0 && booking.folio) {
          await tx.folioTransaction.create({
            data: {
              hotelId: booking.hotelId,
              folioId: booking.folio.id,
              type: 'REFUND',
              category: 'ROOM_CHARGE',
              description: `استرداد مغادرة مبكرة - ${room.room?.roomNumber ?? 'غير محدد'} - ${unusedNights} ليلة`,
              amount: -roomRefund,
              createdById: settledById,
            },
          });

          await tx.folio.update({
            where: { id: booking.folio.id },
            data: {
              totalCharges: { decrement: roomRefund },
              balance: { decrement: roomRefund },
            },
          });
        }

        await tx.bookingRoom.update({
          where: { id: room.id },
          data: { checkOut: new Date() },
        });
      }

      // --- Standard Checkout ---
      let finalBalance = preBalance;
      if (booking.folio) {
        const folioAfterRefund = await tx.folio.findUnique({
          where: { id: booking.folio.id },
        });
        finalBalance = folioAfterRefund ? Number(folioAfterRefund.balance) : 0;

        await tx.folio.update({
          where: { id: booking.folio.id },
          data: {
            status: finalBalance <= 0 ? 'SETTLED' : 'ACTIVE',
            ...(finalBalance <= 0 ? { settledAt: new Date(), settledById } : {}),
          },
        });
      }

for (const room of booking.rooms) {
        if (!room.roomId) continue;
        await tx.room.update({
          where: { id: room.roomId },
          data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
        });

        await tx.housekeepingTask.create({
          data: {
            hotelId: booking.hotelId,
            roomId: room.roomId,
            taskType: 'CLEANING',
            priority: 'NORMAL',
            status: 'PENDING',
          },
        });
      }

    const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_OUT' },
      });

      return { booking: updatedBooking, folioBalance: finalBalance };
    });
  }

  async moveRoom(bookingId: string, hotelId: string, targetRoomId: string, userId?: string, reason?: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: { include: { room: true } },
        folio: true,
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') throw new ValidationError('يمكن نقل الغرفة فقط للنزلاء المقيمين');

    const targetRoom = await prisma.room.findFirst({
      where: { id: targetRoomId, hotelId },
      include: { roomType: true },
    });
    if (!targetRoom) throw new NotFoundError('الغرفة المستهدفة غير موجودة');
    if (targetRoom.status === 'OCCUPIED' || targetRoom.status === 'MAINTENANCE') {
      throw new ValidationError(`الغرفة ${targetRoom.roomNumber} غير متاحة`);
    }

    const moveDate = new Date();

    return tenantTx(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_IN' },
      });

      for (const room of booking.rooms) {
        const totalNights = Math.ceil(
          (room.checkOut.getTime() - room.checkIn.getTime()) / 86400000,
        );
        const usedNights = Math.max(
          0,
          Math.ceil((moveDate.getTime() - room.checkIn.getTime()) / 86400000),
        );
        const remainingNights = totalNights - usedNights;

        if (remainingNights > 0) {
          const oldRate = Number(room.nightlyRate);
          const creditAmount = oldRate * remainingNights;
          const roomIsOld = room.roomId !== targetRoomId;

          if (roomIsOld && booking.folio) {
            // Credit back remaining nights for old room
            await tx.folioTransaction.create({
              data: {
                hotelId: booking.hotelId,
                folioId: booking.folio.id,
                type: 'REFUND',
                category: 'ROOM_CHARGE',
                description: `إلغاء إيجار ${room.room?.roomNumber ?? 'غير محدد'} - ${remainingNights} ليالٍ متبقية (نقل غرفة)`,
                amount: -creditAmount,
                createdById: userId,
              },
            });

            // Charge remaining nights at new room rate
            const newRate = Number(targetRoom.roomType.baseRate);
            const newCharge = newRate * remainingNights;

            await tx.folioTransaction.create({
              data: {
                hotelId: booking.hotelId,
                folioId: booking.folio.id,
                type: 'CHARGE',
                category: 'ROOM_CHARGE',
                description: `إيجار ${targetRoom.roomNumber} - ${remainingNights} ليلة (نقل غرفة)`,
                amount: newCharge,
                createdById: userId,
              },
            });

            // Update folio totals
            await tx.folio.update({
              where: { id: booking.folio.id },
              data: {
                totalCharges: { increment: newCharge - creditAmount },
                balance: { increment: newCharge - creditAmount },
              },
            });

            // If folio was settled, reactivate
            if (booking.folio.status === 'SETTLED') {
              await tx.folio.update({
                where: { id: booking.folio.id },
                data: { status: 'ACTIVE', settledAt: null, settledById: null },
              });
            }
          }
}
 
        // Set old room to DIRTY
        await tx.room.update({
          where: { id: room.roomId! },
          data: { status: 'DIRTY', housekeepingStatus: 'DIRTY' },
        });
 
        // Create housekeeping task for old room
        await tx.housekeepingTask.create({
          data: {
            hotelId: booking.hotelId,
            roomId: room.roomId!,
            taskType: 'CLEANING',
            priority: 'NORMAL',
            status: 'PENDING',
          },
        });
      }

      // Remove old BookingRooms and create new one for target room
      await tx.bookingRoom.deleteMany({
        where: { bookingId },
      });

      const newBookingRoom = await tx.bookingRoom.create({
        data: {
          hotelId: booking.hotelId,
          bookingId,
          roomId: targetRoomId,
          nightlyRate: Number(targetRoom.roomType.baseRate),
          checkIn: booking.rooms[0].checkIn,
          checkOut: booking.rooms[0].checkOut,
        },
      });

      // Set target room to OCCUPIED
      await tx.room.update({
        where: { id: targetRoomId },
        data: { status: 'OCCUPIED' },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          hotelId: booking.hotelId,
          userId,
          action: 'MOVE_ROOM',
          entity: 'BOOKING',
          entityId: bookingId,
          oldValue: JSON.stringify({ rooms: booking.rooms.map((r) => ({ id: r.roomId, number: r.room?.roomNumber ?? 'غير محدد' })) }),
          newValue: JSON.stringify({ rooms: [{ id: targetRoomId, number: targetRoom.roomNumber }], reason }),
        },
      });

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: { rooms: { include: { room: true } }, folio: true },
      });
    });
  }

  async extendStay(bookingId: string, hotelId: string, newCheckOut: Date, userId?: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: {
          include: { room: { include: { roomType: true } } },
        },
        folio: { include: { transactions: true } },
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CONFIRMED' && booking.status !== 'CHECKED_IN') {
      throw new ValidationError('يمكن تمديد الإقامة فقط للحجوزات المؤكدة أو المقيمة');
    }

    const currentCheckOut = booking.rooms[0].checkOut;
    if (newCheckOut <= currentCheckOut) {
      throw new ValidationError('تاريخ المغادرة الجديد يجب أن يكون بعد التاريخ الحالي');
    }

    // Verify availability for extension period (all rooms)
    for (const room of booking.rooms) {
      const overlap = await prisma.bookingRoom.findFirst({
        where: {
          roomId: room.roomId,
          bookingId: { not: bookingId },
          checkIn: { lt: newCheckOut },
          checkOut: { gt: currentCheckOut },
          booking: { hotelId, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        },
      });
      if (overlap) {
        throw new ValidationError(`الغرفة ${room.room?.roomNumber ?? 'غير محدد'} غير متاحة لفترة التمديد`);
      }
    }

    return tenantTx(async (tx) => {
      const oldCheckOut = booking.rooms[0].checkOut;
      const originalCheckIn = booking.rooms[0].checkIn;
      const totalOldNights = Math.ceil(
        (oldCheckOut.getTime() - originalCheckIn.getTime()) / 86400000,
      );
      const totalNewNights = Math.ceil(
        (newCheckOut.getTime() - originalCheckIn.getTime()) / 86400000,
      );
      const extraNights = totalNewNights - totalOldNights;

      // Delete old ROOM_CHARGE transactions from folio
      if (booking.folio) {
        const oldCharges = booking.folio.transactions.filter(
          (t) => t.category === 'ROOM_CHARGE',
        );
        let totalOldChargeAmount = 0;
        for (const charge of oldCharges) {
          totalOldChargeAmount += Number(charge.amount);
          await tx.folioTransaction.delete({ where: { id: charge.id } });
        }

        // Calculate new total charge
        const roomsWithRates = await Promise.all(
          booking.rooms.map(async (r) => ({
            roomNumber: r.room?.roomNumber ?? 'غير محدد',
            nightlyRate: Number(r.nightlyRate || r.room?.roomType?.baseRate),
          })),
        );

        const newTotalRoomCharge = roomsWithRates.reduce(
          (sum, r) => sum + r.nightlyRate * totalNewNights,
          0,
        );

        // Add new ROOM_CHARGE transactions
        for (const r of roomsWithRates) {
          await tx.folioTransaction.create({
            data: {
              hotelId: booking.hotelId,
              folioId: booking.folio.id,
              type: 'CHARGE',
              category: 'ROOM_CHARGE',
              description: `إيجار ${r.roomNumber} - ${totalNewNights} ليلة (تمديد)`,
              amount: r.nightlyRate * totalNewNights,
              createdById: userId,
            },
          });
        }

        const delta = newTotalRoomCharge - totalOldChargeAmount;
        await tx.folio.update({
          where: { id: booking.folio.id },
          data: {
            totalCharges: { increment: delta },
            balance: { increment: delta },
            ...(delta > 0 && booking.folio.status === 'SETTLED'
              ? { status: 'ACTIVE', settledAt: null, settledById: null }
              : {}),
          },
        });
      }

      // Update booking checkOut
      await tx.booking.update({
        where: { id: bookingId },
        data: { updatedAt: new Date() },
      });

      // Update all BookingRoom checkOut dates
      for (const room of booking.rooms) {
        await tx.bookingRoom.update({
          where: { id: room.id },
          data: { checkOut: newCheckOut },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          hotelId: booking.hotelId,
          userId,
          action: 'EXTEND_STAY',
          entity: 'BOOKING',
          entityId: bookingId,
          oldValue: JSON.stringify({
            checkOut: oldCheckOut.toISOString(),
            nights: totalOldNights,
          }),
          newValue: JSON.stringify({
            checkOut: newCheckOut.toISOString(),
            nights: totalNewNights,
          }),
        },
      });

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: { rooms: { include: { room: true } }, folio: true },
      });
    });
  }

  async cancel(bookingId: string, hotelId: string, reason?: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const wasCheckedIn = booking.status === 'CHECKED_IN';

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    for (const room of booking.rooms) {
      if (!room.roomId) continue;
      if (wasCheckedIn) {
        await prisma.room.update({
          where: { id: room.roomId },
          data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
        });

        await prisma.housekeepingTask.create({
          data: {
            hotelId: booking.hotelId,
            roomId: room.roomId,
            taskType: 'CLEANING',
            priority: 'NORMAL',
            status: 'PENDING',
          },
        });
      } else {
        await prisma.room.update({
          where: { id: room.roomId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    return updated;
  }

  async getCancellationPolicy(bookingId: string, hotelId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: { include: { ratePlan: true } },
        cancellationPolicy: true,
      },
    });
    if (!booking) throw new NotFoundError('الحجز غير موجود');

    // Hierarchy: RatePlan policy → Booking policy → Default hotel policy
    let policy = booking.cancellationPolicy;

    if (!policy) {
      const ratePlanPolicies = booking.rooms
        .map((r) => r.ratePlan?.cancellationPolicyId)
        .filter(Boolean);
      if (ratePlanPolicies.length > 0) {
        policy = await prisma.cancellationPolicy.findUnique({
          where: { id: ratePlanPolicies[0]! },
        });
      }
    }

    if (!policy) {
      policy = await prisma.cancellationPolicy.findFirst({
        where: { hotelId: booking.hotelId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    return policy;
  }

  async getCancellationQuote(bookingId: string, hotelId: string, cancelledAt: Date = new Date()) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: true,
        folio: { include: { payments: true, transactions: true } },
      },
    });
    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const policy = await this.getCancellationPolicy(bookingId, hotelId);
    if (!policy) {
      return {
        totalPaid: 0,
        totalCharges: 0,
        penaltyAmount: 0,
        refundAmount: 0,
        refundPercentage: 0,
        canRefund: false,
        policyName: null,
        hasPolicy: false,
      };
    }

    const checkInDate = booking.rooms[0]?.checkIn || new Date();
    const hoursBeforeCheckIn = (checkInDate.getTime() - cancelledAt.getTime()) / 3600000;
    const totalCharges = booking.folio ? Number(booking.folio.totalCharges) : 0;
    const totalPaid = booking.folio ? Number(booking.folio.totalPaid) : 0;

    const { refundAmount, refundPercentage } = pricingService.calculateCancellationRefund(
      policy.rules,
      totalCharges,
      Math.max(0, hoursBeforeCheckIn),
    );

    const penaltyAmount = totalCharges - refundAmount;

    return {
      totalPaid,
      totalCharges,
      penaltyAmount,
      refundAmount: Math.min(refundAmount, totalPaid),
      refundPercentage,
      canRefund: refundAmount > 0 && totalPaid > 0,
      policyName: policy.nameAr || policy.name,
      hasPolicy: true,
      policyId: policy.id,
    };
  }

  async cancelWithRefund(bookingId: string, hotelId: string, userId?: string, options?: {
    reason?: string;
    waivePenalty?: boolean;
    noShow?: boolean;
  }) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId },
      include: {
        rooms: { include: { room: true } },
        folio: { include: { payments: { where: { status: 'SUCCEEDED' } }, transactions: true } },
        guest: true,
      },
    });
    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status === 'CANCELLED' || booking.status === 'CHECKED_OUT') {
      throw new ValidationError('الحجز ملغي أو منتهٍ بالفعل');
    }

    const wasCheckedIn = booking.status === 'CHECKED_IN';
    const cancelledAt = new Date();

    const quote = await this.getCancellationQuote(bookingId, hotelId, cancelledAt);
    const penaltyAmount = options?.waivePenalty ? 0 : quote.penaltyAmount;
    const refundAmount = options?.waivePenalty ? quote.totalPaid : quote.refundAmount;

    // Determine new status
    const newStatus = options?.noShow ? 'NO_SHOW' : 'CANCELLED';

    return tenantTx(async (tx) => {
      // 1. Update booking status
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: newStatus,
          cancelledAt,
          cancellationReason: options?.reason,
        },
      });

      // 2. Handle folio financials
      if (booking.folio) {
        // 2a. Apply penalty charge if any
        if (penaltyAmount > 0) {
          await tx.folioTransaction.create({
            data: {
              hotelId: booking.hotelId,
              folioId: booking.folio.id,
              type: 'CHARGE',
              category: 'ROOM_CHARGE',
              description: `غرامة إلغاء - ${quote.policyName || 'سياسة الإلغاء'}`,
              amount: penaltyAmount,
              createdById: userId,
            },
          });

          await tx.folio.update({
            where: { id: booking.folio.id },
            data: {
              totalCharges: { increment: penaltyAmount },
              balance: { increment: penaltyAmount },
            },
          });
        }

        // 2b. Process refund to wallet if guest has wallet and refund is due
        if (refundAmount > 0 && booking.guestId) {
          const wallet = await tx.wallet.findUnique({
            where: { guestId_hotelId: { guestId: booking.guestId, hotelId: booking.hotelId } },
          });

          if (wallet) {
            const refundDecimal = new Prisma.Decimal(refundAmount);
            const newBalance = wallet.balance.add(refundDecimal);

            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: newBalance },
            });

            await tx.walletTransaction.create({
              data: {
                hotelId: booking.hotelId,
                walletId: wallet.id,
                type: 'REFUND',
                amount: refundDecimal,
                balanceBefore: wallet.balance,
                balanceAfter: newBalance,
                description: `استرداد حجز #${booking.bookingNo}`,
                referenceId: booking.id,
                method: 'CASH',
                status: 'COMPLETED',
                createdById: userId,
              },
            });

            // Add folio transaction for the refund
            await tx.folioTransaction.create({
              data: {
                hotelId: booking.hotelId,
                folioId: booking.folio.id,
                type: 'REFUND',
                category: 'REFUND',
                description: `استرداد مبلغ ${refundAmount} د.ل إلى المحفظة`,
                amount: -refundAmount,
                createdById: userId,
              },
            });

            await tx.folio.update({
              where: { id: booking.folio.id },
              data: {
                totalPaid: { decrement: refundAmount },
                balance: { decrement: refundAmount },
              },
            });
          }
        }

        // 2c. Allocate the refund serially across succeeded payments (each
        // payment refunded up to its remaining balance) so multi-payment folios
        // are not over-refunded/double-counted.
        if (refundAmount > 0) {
          let remaining = refundAmount;
          for (const payment of booking.folio.payments) {
            if (remaining <= 0) break;
            const refundable = Number(payment.amount) - Number(payment.refundedAmount || 0);
            if (refundable <= 0) continue;
            const applied = Math.min(remaining, refundable);
            remaining -= applied;

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                refundedAmount: { increment: applied },
                status:
                  Number(payment.refundedAmount || 0) + applied >= Number(payment.amount)
                    ? 'REFUNDED'
                    : 'PARTIALLY_REFUNDED',
              },
            });

            await tx.refund.create({
              data: {
                hotelId: booking.hotelId,
                paymentId: payment.id,
                amount: applied,
                reason: `إلغاء حجز #${booking.bookingNo}: ${options?.reason || ''}`,
                status: 'PROCESSED',
              },
            });
          }
        }
      }

      // 3. Release rooms
      for (const room of booking.rooms) {
        if (!room.roomId) continue; // Skip web bookings without assigned room
        if (wasCheckedIn) {
          await tx.room.update({
            where: { id: room.roomId },
            data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
          });

          await tx.housekeepingTask.create({
            data: {
              hotelId: booking.hotelId,
              roomId: room.roomId,
              taskType: 'CLEANING',
              priority: 'NORMAL',
              status: 'PENDING',
            },
          });
        } else {
          await tx.room.update({
            where: { id: room.roomId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      // 4. Audit log
      await tx.auditLog.create({
        data: {
          hotelId: booking.hotelId,
          userId,
          action: options?.noShow ? 'NO_SHOW' : 'CANCEL',
          entity: 'BOOKING',
          entityId: bookingId,
          oldValue: JSON.stringify({
            status: booking.status,
            totalCharges: booking.folio ? Number(booking.folio.totalCharges) : 0,
            totalPaid: booking.folio ? Number(booking.folio.totalPaid) : 0,
          }),
          newValue: JSON.stringify({
            status: newStatus,
            penaltyAmount,
            refundAmount,
            waivePenalty: options?.waivePenalty,
            reason: options?.reason,
          }),
        },
      });

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: { rooms: { include: { room: true } }, folio: true },
      });
    });
  }
}