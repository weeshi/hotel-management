import { NextRequest } from 'next/server';
import { GuestService } from '@/lib/services/guest.service';
import { withAuth } from '@/middlewares/auth';
import { withValidation } from '@/middlewares/validate';
import { withRateLimit } from '@/middlewares/rate-limit';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { ZodError } from 'zod';
import { guestSchema } from '@hotel/shared';

const guestService = new GuestService();

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
    const guest = await guestService.getById(params.id, user?.hotelId);

    return successResponse(guest);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const guest = await guestService.update(params.id, body);

    return successResponse(guest);
  } catch (error: any) {
    return sanitizeError(error);
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guestService.remove(params.id);

    return successResponse({ deleted: true });
  } catch (error: any) {
    return sanitizeError(error);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const PUT = withAuth(withCsrf(withRateLimit(putHandler)), ['ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN']);
