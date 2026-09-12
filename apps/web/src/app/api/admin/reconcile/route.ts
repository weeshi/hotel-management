import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const { bookingNo, folioId } = body;

    if (!bookingNo && !folioId) {
      return errorResponse('يجب إدخال رقم الحجز أو معرف الفاتورة', 400);
    }

    let folio;
    if (folioId) {
      folio = await prisma.folio.findFirst({
        where: { id: folioId, booking: { hotelId: user.hotelId } },
      });
    } else {
      const booking = await prisma.booking.findFirst({ where: { bookingNo, hotelId: user.hotelId } });
      if (!booking) return errorResponse('الحجز غير موجود', 404);
      folio = await prisma.folio.findFirst({ where: { bookingId: booking.id } });
    }

    if (!folio) return errorResponse('الفاتورة غير موجودة', 404);

    const payments = await prisma.payment.findMany({
      where: { folioId: folio.id, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
    });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount) - Number(p.refundedAmount), 0);

    const totalCharges = await prisma.folioTransaction.aggregate({
      where: { folioId: folio.id, type: 'CHARGE' },
      _sum: { amount: true },
    });

    const actualCharges = Number(totalCharges._sum.amount || 0);
    const newBalance = actualCharges - totalPaid;

    await prisma.folio.update({
      where: { id: folio.id },
      data: {
        totalPaid,
        totalCharges: actualCharges,
        balance: Math.max(0, newBalance),
        status: newBalance <= 0 ? 'SETTLED' : folio.status,
        ...(newBalance <= 0 && folio.status !== 'SETTLED' ? { settledAt: new Date() } : {}),
      },
    });

    return successResponse({
      folioId: folio.id,
      oldTotalPaid: Number(folio.totalPaid),
      newTotalPaid: totalPaid,
      oldBalance: Number(folio.balance),
      newBalance: Math.max(0, newBalance),
      status: newBalance <= 0 ? 'SETTLED' : folio.status,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ طھطµط­ظٹط­ ط§ظ„ظپط§طھظˆط±ط©', 400);
  }
}

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const bookingNo = searchParams.get('bookingNo');

    let where: any = { booking: { hotelId: user.hotelId } };
    if (bookingNo) {
      const booking = await prisma.booking.findFirst({ where: { bookingNo, hotelId: user.hotelId }, include: { folio: true } });
      if (!booking) return errorResponse('الحجز غير موجود', 404);
      where.id = booking.folio?.id;
      if (!where.id) return errorResponse('لا توجد فاتورة لهذا الحجز', 404);
    }

    const folios = await prisma.folio.findMany({
      where,
      include: {
        booking: { select: { bookingNo: true, guestName: true } },
        payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const result = folios.map(f => {
      const paidFromPayments = f.payments.reduce((s, p) => s + Number(p.amount) - Number(p.refundedAmount), 0);
      const needsReconcile = Number(f.totalPaid) !== paidFromPayments;
      return {
        folioId: f.id,
        bookingNo: f.booking.bookingNo,
        guestName: f.booking.guestName,
        totalCharges: Number(f.totalCharges),
        totalPaid: Number(f.totalPaid),
        balance: Number(f.balance),
        computedPaid: paidFromPayments,
        needsReconcile,
      };
    });

    return successResponse({ folios: result, count: result.length });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ظپظˆط§طھظٹط±', 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
