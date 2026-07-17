import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse } from '@/lib/utils/api-response';

const DURATION_MAP: Record<string, keyof typeof prisma.safeBoxPackage.fields> = {
  DAILY: 'dailyPrice',
  WEEKLY: 'weeklyPrice',
  MONTHLY: 'monthlyPrice',
} as any;

function calcExpectedEndDate(duration: string, from: Date): Date {
  const d = new Date(from);
  switch (duration) {
    case 'DAILY': d.setDate(d.getDate() + 1); break;
    case 'WEEKLY': d.setDate(d.getDate() + 7); break;
    case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
  }
  return d;
}

// --- POST: Create safe box with $transaction + billing ---

async function createSafeBoxHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const { bookingId, externalClientId, roomId, notes, items, packageId, rentalDuration } = body;

    // --- Enforcement: exactly one ownership link ---
    const hasBooking = !!bookingId;
    const hasExternal = !!externalClientId;

    if (hasBooking === hasExternal) {
      return errorResponse('يجب تحديد إما الحجز (bookingId) أو العميل الخارجي (externalClientId)، وليس كليهما أو لا شيء', 400);
    }

    if (!packageId) {
      return errorResponse('packageId مطلوب', 400);
    }

    if (!rentalDuration || !['DAILY', 'WEEKLY', 'MONTHLY'].includes(rentalDuration)) {
      return errorResponse('rentalDuration يجب أن يكون DAILY أو WEEKLY أو MONTHLY', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // --- 1. Look up package to get price ---
      const pkg = await tx.safeBoxPackage.findFirst({
        where: { id: packageId, hotelId: user.hotelId, isActive: true },
      });
      if (!pkg) {
        throw new Error('الباقة غير موجودة أو غير نشطة');
      }

      let rentalFee: number;
      switch (rentalDuration) {
        case 'DAILY': rentalFee = Number(pkg.dailyPrice); break;
        case 'WEEKLY': rentalFee = Number(pkg.weeklyPrice); break;
        case 'MONTHLY': rentalFee = Number(pkg.monthlyPrice); break;
        default: throw new Error('مدة الإيجار غير صالحة');
      }

      const openedAt = new Date();
      const expectedEndDate = calcExpectedEndDate(rentalDuration, openedAt);

      // --- 2. Validate entities belong to same hotel ---
      if (hasBooking) {
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, hotelId: user.hotelId },
        });
        if (!booking) throw new Error('الحجز غير موجود في هذا الفندق');
      }

      if (hasExternal) {
        const client = await tx.externalClient.findFirst({
          where: { id: externalClientId, hotelId: user.hotelId },
        });
        if (!client) throw new Error('العميل الخارجي غير موجود في هذا الفندق');
      }

      if (roomId) {
        const room = await tx.room.findFirst({
          where: { id: roomId, hotelId: user.hotelId },
        });
        if (!room) throw new Error('الغرفة غير موجودة في هذا الفندق');
      }

      // --- 3. Create the safe box with duration snapshot + nested items ---
      const box = await tx.safeDepositBox.create({
        data: {
          hotelId: user.hotelId,
          roomId: roomId || null,
          bookingId: bookingId || null,
          externalClientId: externalClientId || null,
          packageId: pkg.id,
          rentalFee,
          rentalDuration,
          expectedEndDate,
          notes: notes || null,
          openedById: user.userId,
          items: items?.length ? {
            create: items.map((it: any) => ({
              description: it.description,
              quantity: it.quantity || 1,
              notes: it.notes || null,
            })),
          } : undefined,
        },
        include: {
          room: { select: { roomNumber: true, floor: true } },
          booking: { select: { bookingNo: true, guest: { select: { name: true } } } },
          externalClient: { select: { name: true } },
          package: { select: { name: true, dailyPrice: true, weeklyPrice: true, monthlyPrice: true } },
          openedBy: { select: { name: true } },
          items: true,
        },
      });

      // --- 4. Billing logic ---

      if (hasBooking) {
        // Hotel Guest path: find or create ACTIVE folio → FolioTransaction
        let folio = await tx.folio.findFirst({
          where: { bookingId, status: 'ACTIVE' },
        });

        if (!folio) {
          folio = await tx.folio.create({
            data: {
              bookingId,
              status: 'ACTIVE',
            },
          });
        }

        await tx.folioTransaction.create({
          data: {
            folioId: folio.id,
            type: 'CHARGE',
            category: 'SAFE_DEPOSIT',
            description: 'رسوم فتح صندوق أمانات',
            amount: rentalFee,
            createdById: user.userId,
          },
        });
      } else {
        // External Client path: generate standalone Invoice
        const invoiceNo = `SAF-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        await tx.invoice.create({
          data: {
            externalClientId,
            invoiceNo,
            total: rentalFee,
          },
        });
      }

      return box;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء صندوق الأمانات');
  }
}

export const POST = withAuth(withCsrf(createSafeBoxHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
