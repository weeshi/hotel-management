import { prisma } from '@/lib/utils/prisma';
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
      roomId: string;
      ratePlanId?: string;
      nightlyRate?: number;
    }>;
    services?: Array<{ serviceId: string; quantity: number }>;
    source?: string;
    cancellationPolicyId?: string;
  }) {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);

    if (nights < 1) throw new ValidationError('مدة الإقامة يجب أن تكون ليلة واحدة على الأقل');

    const bookingRooms: Array<{
      roomId: string;
      ratePlanId?: string;
      nightlyRate: number;
      checkIn: Date;
      checkOut: Date;
    }> = [];

    let cancellationPolicyId = data.cancellationPolicyId;

    for (const roomData of data.rooms) {
      const room = await prisma.room.findUnique({
        where: { id: roomData.roomId },
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
          room.roomTypeId, room.id, checkInDate, checkOutDate,
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
      });
      data.guestId = guest.id;
    }

    const bookingNo = await generateBookingNumber(data.hotelId);
    const isReception = data.source === 'RECEPTION';

    // Resolve services with their prices before the transaction
    const servicesWithPrice: Array<{ serviceId: string; quantity: number; price: number }> = [];
    if (data.services && data.services.length > 0) {
      for (const svc of data.services) {
        const service = await prisma.service.findUnique({ where: { id: svc.serviceId } });
        if (service) {
          servicesWithPrice.push({ ...svc, price: service.price * svc.quantity });
        }
      }
    }

    const booking = await prisma.$transaction(async (tx) => {
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
          rooms: {
            create: bookingRooms.map((r) => ({
              roomId: r.roomId,
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
            bookingId: created.id,
            totalCharges: 0,
            totalPaid: 0,
            balance: 0,
          },
        });

        // Add service charges as folio transactions
        for (const svc of servicesWithPrice) {
          const service = await tx.service.findUnique({ where: { id: svc.serviceId } });
          if (service) {
            await tx.bookingService.create({
              data: {
                bookingId: created.id,
                serviceId: svc.serviceId,
                quantity: svc.quantity,
                price: svc.price,
              },
            });
            await tx.folioTransaction.create({
              data: {
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

  async confirm(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: true },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' },
    });

    return updated;
  }

  async checkIn(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rooms: { include: { room: true } } },
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

    const folio = await prisma.folio.create({
      data: {
        bookingId,
        totalCharges: 0,
        totalPaid: 0,
        balance: 0,
      },
    });

    for (const room of booking.rooms) {
      const nights = Math.ceil(
        (room.checkOut.getTime() - room.checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );
      await folioRepo.addTransaction(folio.id, {
        type: 'CHARGE',
        category: 'ROOM_CHARGE',
        description: `إيجار ${room.room.roomNumber} - ${nights} ليالٍ`,
        amount: Number(room.nightlyRate) * nights,
      });

      await prisma.room.update({
        where: { id: room.roomId },
        data: { status: 'OCCUPIED' },
      });
    }

    const pendingServices = await prisma.bookingService.findMany({
      where: { bookingId },
      include: { service: true },
    });
    for (const bs of pendingServices) {
      await folioRepo.addTransaction(folio.id, {
        type: 'CHARGE',
        category: 'SERVICE',
        description: `خدمة: ${bs.service.nameAr || bs.service.name} x${bs.quantity}`,
        amount: bs.price,
      });
    }

    return prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN' },
    });
  }

  async checkOut(bookingId: string, settledById: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: true,
        folio: true,
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') {
      throw new ValidationError('النزيل ليس في إقامة نشطة');
    }

    const balance = booking.folio ? Number(booking.folio.balance) : 0;
    if (balance > 0) {
      throw new ValidationError(
        `لا يمكن تسجيل الخروج. يوجد مبلغ متبقي بقيمة ${balance.toFixed(2)} د.ل. يجب سداد الفاتورة أولاً.`
      );
    }

    return prisma.$transaction(async (tx) => {
      if (booking.folio) {
        await tx.folio.update({
          where: { id: booking.folio.id },
          data: {
            status: 'SETTLED',
            settledAt: new Date(),
            settledById,
          },
        });
      }

      for (const room of booking.rooms) {
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

      return tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_OUT' },
      });
    });
  }

  async moveRoom(bookingId: string, targetRoomId: string, userId?: string, reason?: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: { include: { room: true } },
        folio: true,
      },
    });

    if (!booking) throw new NotFoundError('الحجز غير موجود');
    if (booking.status !== 'CHECKED_IN') throw new ValidationError('يمكن نقل الغرفة فقط للنزلاء المقيمين');

    const targetRoom = await prisma.room.findUnique({
      where: { id: targetRoomId },
      include: { roomType: true },
    });
    if (!targetRoom) throw new NotFoundError('الغرفة المستهدفة غير موجودة');
    if (targetRoom.status === 'OCCUPIED' || targetRoom.status === 'MAINTENANCE') {
      throw new ValidationError(`الغرفة ${targetRoom.roomNumber} غير متاحة`);
    }

    const moveDate = new Date();

    return prisma.$transaction(async (tx) => {
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
                folioId: booking.folio.id,
                type: 'REFUND',
                category: 'ROOM_CHARGE',
                description: `إلغاء إيجار ${room.room.roomNumber} - ${remainingNights} ليالٍ متبقية (نقل غرفة)`,
                amount: -creditAmount,
                createdById: userId,
              },
            });

            // Charge remaining nights at new room rate
            const newRate = Number(targetRoom.roomType.baseRate);
            const newCharge = newRate * remainingNights;

            await tx.folioTransaction.create({
              data: {
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
          where: { id: room.roomId },
          data: { status: 'DIRTY', housekeepingStatus: 'DIRTY' },
        });

        // Create housekeeping task for old room
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

      // Remove old BookingRooms and create new one for target room
      await tx.bookingRoom.deleteMany({
        where: { bookingId },
      });

      const newBookingRoom = await tx.bookingRoom.create({
        data: {
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
          oldValue: JSON.stringify({ rooms: booking.rooms.map((r) => ({ id: r.roomId, number: r.room.roomNumber })) }),
          newValue: JSON.stringify({ rooms: [{ id: targetRoomId, number: targetRoom.roomNumber }], reason }),
        },
      });

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: { rooms: { include: { room: true } }, folio: true },
      });
    });
  }

  async extendStay(bookingId: string, newCheckOut: Date, userId?: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
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
          booking: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        },
      });
      if (overlap) {
        throw new ValidationError(`الغرفة ${room.room.roomNumber} غير متاحة لفترة التمديد`);
      }
    }

    return prisma.$transaction(async (tx) => {
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
            roomNumber: r.room.roomNumber,
            nightlyRate: Number(r.nightlyRate || r.room.roomType.baseRate),
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

  async cancel(bookingId: string, reason?: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
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

  async getCancellationPolicy(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
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

  async getCancellationQuote(bookingId: string, cancelledAt: Date = new Date()) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        rooms: true,
        folio: { include: { payments: true, transactions: true } },
      },
    });
    if (!booking) throw new NotFoundError('الحجز غير موجود');

    const policy = await this.getCancellationPolicy(bookingId);
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

  async cancelWithRefund(bookingId: string, userId?: string, options?: {
    reason?: string;
    waivePenalty?: boolean;
    noShow?: boolean;
  }) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
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

    const quote = await this.getCancellationQuote(bookingId, cancelledAt);
    const penaltyAmount = options?.waivePenalty ? 0 : quote.penaltyAmount;
    const refundAmount = options?.waivePenalty ? quote.totalPaid : quote.refundAmount;

    // Determine new status
    const newStatus = options?.noShow ? 'NO_SHOW' : 'CANCELLED';

    return prisma.$transaction(async (tx) => {
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

        // 2c. Mark existing payments as refunded if we processed refund
        if (refundAmount > 0) {
          for (const payment of booking.folio.payments) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                refundedAmount: { increment: refundAmount },
                status: refundAmount >= Number(payment.amount) ? 'REFUNDED' : 'SUCCEEDED',
              },
            });

            await tx.refund.create({
              data: {
                paymentId: payment.id,
                amount: Math.min(refundAmount, Number(payment.amount)),
                reason: `إلغاء حجز #${booking.bookingNo}: ${options?.reason || ''}`,
                status: 'PROCESSED',
              },
            });
          }
        }
      }

      // 3. Release rooms
      for (const room of booking.rooms) {
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