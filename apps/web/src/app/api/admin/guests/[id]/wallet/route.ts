import { NextRequest } from 'next/server';
import { GuestService } from '@/lib/services/guest.service';
import { WalletService } from '@/lib/services/wallet.service';
import { withAuth } from '@/middlewares/auth';
import { withRateLimit } from '@/middlewares/rate-limit';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { ZodError } from 'zod';

const guestService = new GuestService();
const walletService = new WalletService();

function sanitizeError(error: any) {
  if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
  if (error instanceof ZodError) {
    return errorResponse(error.errors.map(e => e.message).join('، '), 422);
  }
  return errorResponse('حدث خطأ غير متوقع، يرجى المحاولة لاحقاً', 400);
}

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const wallet = await guestService.getWallet(params.id, user.hotelId);

    return successResponse(wallet);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.type || !body.amount) return errorResponse('نوع المعاملة والمبلغ مطلوبان', 400);

    let result;
    if (body.type === 'DEPOSIT') {
      result = await walletService.deposit({
        guestId: params.id,
        hotelId: user.hotelId,
        amount: body.amount,
        description: body.description,
        method: body.method,
        createdById: user?.userId,
        idempotencyKey: body.idempotencyKey,
        userRole: user.role,
      });
    } else if (body.type === 'WITHDRAWAL') {
      result = await walletService.withdraw({
        guestId: params.id,
        hotelId: user.hotelId,
        amount: body.amount,
        description: body.description,
        method: body.method,
        createdById: user?.userId,
        idempotencyKey: body.idempotencyKey,
        userRole: user.role,
      });
    } else {
      return errorResponse('نوع المعاملة غير صالح', 400);
    }

    return successResponse(result, 201);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withRateLimit(postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
