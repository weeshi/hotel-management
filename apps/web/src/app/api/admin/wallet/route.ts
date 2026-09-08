import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { WalletService } from '@/lib/services/wallet.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

const walletService = new WalletService();

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');
    const email = searchParams.get('email');

    let guest;
    if (guestId) guest = await prisma.guest.findFirst({ where: { id: guestId, hotelId: user.hotelId } });
    else if (email) guest = await prisma.guest.findFirst({ where: { email, hotelId: user.hotelId } });

    if (!guest) return errorResponse('ط§ظ„ط¶ظٹظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);

    const wallet = await walletService.getOrCreateWallet(guest.id, user.hotelId);
    return successResponse({ guestId: guest.id, guestName: guest.name, balance: Number(wallet.balance), walletId: wallet.id });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ظ…ط­ظپط¸ط©');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const { guestId, amount, description, idempotencyKey } = body;

    if (!guestId || !amount || amount <= 0) return errorResponse('ظ…ط¹ط±ظپ ط§ظ„ط¶ظٹظپ ظˆط§ظ„ظ…ط¨ظ„ط؛ ظ…ط·ظ„ظˆط¨ط§ظ†', 400);

    await walletService.deposit({
      guestId,
      hotelId: user.hotelId,
      amount,
      description: description || 'ط¥ظٹط¯ط§ط¹ ظپظٹ ط§ظ„ظ…ط­ظپط¸ط©',
      method: body.method,
      idempotencyKey,
      createdById: user.userId,
      userRole: user.role,
    });

    const wallet = await walletService.getOrCreateWallet(guestId, user.hotelId);

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'DEPOSIT',
      entity: 'WALLET',
      entityId: wallet.id,
      newValue: JSON.stringify({ amount, guestId }),
    });

    return NextResponse.json({ success: true, data: wallet }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظٹط¯ط§ط¹ ط§ظ„ظ…ط­ظپط¸ط©', 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withRateLimit(postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
