import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { enqueuePublishJobs, formatLocalDate } from '@/workers/queue';

const VALID_PROVIDERS = ['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'AGODA', 'TRIP', 'OTHER'];

// Enqueues one `pushToOTA` job per (enabled mapping × date) and returns 202
// immediately. All snapshot building and OTA delivery happens in the worker.
async function handler(request: NextRequest) {
  const user = (request as any).user;
  const body = await request.json();

  const provider = String(body.provider || 'BOOKING_COM');
  if (!VALID_PROVIDERS.includes(provider)) {
    return errorResponse('مزود القناة غير معروف', 400);
  }

  const from = body.from ? new Date(String(body.from) + 'T00:00:00') : new Date();
  const to = body.to
    ? new Date(String(body.to) + 'T00:00:00')
    : new Date(Date.now() + 7 * 86400000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return errorResponse('نطاق التواريخ غير صالح', 400);
  }

  const result = await enqueuePublishJobs({
    hotelId: user.hotelId,
    provider,
    from,
    to,
  });

  return successResponse(
    {
      queued: true,
      mappings: result.mappings,
      accepted: result.accepted,
      skipped: result.skipped,
      from: formatLocalDate(from),
      to: formatLocalDate(to),
    },
    202
  );
}

export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);