import { NextRequest } from 'next/server';
import { GuestService } from '@/lib/services/guest.service';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { ZodError } from 'zod';

const guestService = new GuestService();

function sanitizeError(error: any) {
  if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
  if (error instanceof ZodError) {
    return errorResponse(error.errors.map(e => e.message).join('طŒ '), 422);
  }
  return errorResponse('ط­ط¯ط« ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹طŒ ظٹط±ط¬ظ‰ ط§ظ„ظ…ط­ط§ظˆظ„ط© ظ„ط§ط­ظ‚ط§ظ‹', 400);
}

async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    const guests = await guestService.quickSearch(q);

    return successResponse(guests);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
