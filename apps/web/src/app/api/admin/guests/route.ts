import { NextRequest } from 'next/server';
import { GuestService } from '@/lib/services/guest.service';
import { withAuth } from '@/middlewares/auth';
import { withValidation } from '@/middlewares/validate';
import { withRateLimit } from '@/middlewares/rate-limit';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse, paginatedResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { ZodError } from 'zod';
import { guestSchema } from '@hotel/shared';

const guestService = new GuestService();

function sanitizeError(error: any) {
  if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
  if (error instanceof ZodError) {
    return errorResponse(error.errors.map(e => e.message).join('طŒ '), 422);
  }
  console.error('[GUESTS API] Unhandled error:', error);
  return errorResponse('ط­ط¯ط« ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹طŒ ظٹط±ط¬ظ‰ ط§ظ„ظ…ط­ط§ظˆظ„ط© ظ„ط§ط­ظ‚ط§ظ‹', 400);
}

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || undefined;
    const nationality = searchParams.get('nationality') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await guestService.list({ query, nationality, hotelId: user?.hotelId, page, limit });

    return paginatedResponse(result.data, result.total, page, limit);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const guest = await guestService.create(body, user.hotelId);

    return successResponse(guest, 201);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withValidation(guestSchema, withRateLimit(postHandler))), ['ADMIN', 'MANAGER', 'RECEPTION']);
