import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    if (!user?.hotelId) return errorResponse('ظ…ط¹ط±ظپ ط§ظ„ظپظ†ط¯ظ‚ ظ…ط·ظ„ظˆط¨', 400);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const guestId = searchParams.get('guestId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const exportAll = searchParams.get('export') === 'csv';

    const where: any = { wallet: { hotelId: user.hotelId } };

    if (type) where.type = type;
    if (guestId) where.wallet = { ...where.wallet, guestId };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    if (search) {
      where.wallet = {
        ...where.wallet,
        guest: { name: { contains: search } },
      };
    }

    const skip = exportAll ? 0 : (page - 1) * limit;
    const take = exportAll ? undefined : limit;

    const [transactions, total, summary] = await prisma.$transaction([
      prisma.walletTransaction.findMany({
        where,
        include: {
          wallet: {
            include: { guest: { select: { id: true, name: true, phone: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.walletTransaction.count({ where }),
      prisma.wallet.aggregate({
        where: { hotelId: user.hotelId },
        _count: true,
        _sum: { balance: true },
      }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [todayTopUp, todayWithdrawal] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: { wallet: { hotelId: user.hotelId }, type: 'DEPOSIT', createdAt: { gte: todayStart, lt: todayEnd } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { wallet: { hotelId: user.hotelId }, type: 'WITHDRAWAL', createdAt: { gte: todayStart, lt: todayEnd } },
        _sum: { amount: true },
      }),
    ]);

    const enriched = await Promise.all(
      transactions.map(async (tx) => {
        let createdByName = '';
        if (tx.createdById) {
          const creator = await prisma.user.findFirst({
            where: { id: tx.createdById, hotelId: user.hotelId },
            select: { name: true },
          });
          createdByName = creator?.name || '';
        }
        return {
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount),
          method: tx.method,
          description: tx.description,
          referenceId: tx.referenceId,
          createdById: tx.createdById,
          createdByName,
          createdAt: tx.createdAt,
          guestName: tx.wallet.guest.name,
          guestPhone: tx.wallet.guest.phone,
          walletBalanceAfter: 0,
        };
      })
    );

    const totalPages = Math.ceil(total / limit);

    return successResponse({
      summary: {
        totalWallets: summary._count,
        totalBalance: Number(summary._sum.balance || 0),
        todayTopUp: Number(todayTopUp._sum.amount || 0),
        todayWithdrawal: Number(todayWithdrawal._sum.amount || 0),
      },
      transactions: enriched,
      pagination: { total, page, limit, totalPages },
    });
  } catch (error: any) {
    if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
    console.error('[WALLET TRANSACTIONS]', error);
    return errorResponse('ظپط´ظ„ ط¬ظ„ط¨ ظ…ط¹ط§ظ…ظ„ط§طھ ط§ظ„ظ…ط­ظپط¸ط©', 400);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER']);
