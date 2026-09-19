import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limiter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: bookingId, sessionId } = await params;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `ratelimit:payment-status:${bookingId}:${ip}`;
  let rateLimitResult: RateLimitResult;
  try {
    rateLimitResult = await checkRateLimit(rateLimitKey, 30, 60);
  } catch (err) {
    // Redis outage → fail open (app-wide convention), otherwise the poller
    // 500s and the guest never learns their payment did succeed.
    console.error('[Payment Status] Redis limiter unavailable, failing open:', (err as Error).message);
    rateLimitResult = { allowed: true, current: 0, limit: 30, remaining: 30, resetAt: 0 };
  }
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'طلبات كثيرة جداً. حاول بعد دقيقة',
          code: 'RATE_LIMITED',
          retryAfter: rateLimitResult.resetAt - Math.floor(Date.now() / 1000),
        },
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimitResult.resetAt - Math.floor(Date.now() / 1000)) },
      }
    );
  }

  const session = await prisma.paymentSession.findFirst({
    where: { id: sessionId, bookingId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!session) {
    return errorResponse('جلسة الدفع غير موجودة', 404, 'SESSION_NOT_FOUND');
  }

  return successResponse({ verified: session.status === 'SUCCEEDED' });
}