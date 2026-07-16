import { NextRequest } from 'next/server';
import { WalletService } from '@/lib/services/wallet.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';

const walletService = new WalletService();

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const wallet = await walletService.toggleFreeze(params.id, user.role);

    return successResponse({
      id: wallet.id,
      isFrozen: wallet.isFrozen,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse(error.message || 'فشل تحديث حالة التجميد', 400);
  }
}

export const POST = withAuth(withCsrf(handler), ['ADMIN', 'MANAGER']);
