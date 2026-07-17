import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function postHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingNo, folioId } = body;

    if (!bookingNo && !folioId) {
      return errorResponse('ظٹط¬ط¨ ط¥ط¯ط®ط§ظ„ ط±ظ‚ظ… ط§ظ„ط­ط¬ط² ط£ظˆ ظ…ط¹ط±ظپ ط§ظ„ظپط§طھظˆط±ط©', 400);
    }

    let folio;
    if (folioId) {
      folio = await prisma.folio.findUnique({ where: { id: folioId } });
    } else {
      const booking = await prisma.booking.findUnique({ where: { bookingNo } });
      if (!booking) return errorResponse('ط§ظ„ط­ط¬ط² ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);
      folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    }

    if (!folio) return errorResponse('ط§ظ„ظپط§طھظˆط±ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©', 404);

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
    const { searchParams } = new URL(request.url);
    const bookingNo = searchParams.get('bookingNo');

    const where: any = {};
    if (bookingNo) {
      const booking = await prisma.booking.findUnique({ where: { bookingNo }, include: { folio: true } });
      if (!booking) return errorResponse('ط§ظ„ط­ط¬ط² ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);
      where.id = booking.folio?.id;
      if (!where.id) return errorResponse('ظ„ط§ طھظˆط¬ط¯ ظپط§طھظˆط±ط© ظ„ظ‡ط°ط§ ط§ظ„ط­ط¬ط²', 404);
    }

    const folios = await prisma.folio.findMany({
      where: bookingNo ? { id: where.id } : {},
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
