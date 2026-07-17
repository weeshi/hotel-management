import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const wallet = await prisma.wallet.findUnique({
      where: { id: params.id },
      include: {
        guest: { select: { id: true, name: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!wallet) return errorResponse('المحفظة غير موجودة', 404);

    return successResponse({
      id: wallet.id,
      guestId: wallet.guestId,
      guestName: wallet.guest.name,
      guestEmail: wallet.guest.email,
      balance: Number(wallet.balance),
      transactions: wallet.transactions,
    });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب المحفظة');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
