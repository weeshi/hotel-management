import { NextResponse } from 'next/server';

const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60000
) {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || now > record.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  if (record.count >= limit) {
    return { allowed: false };
  }

  record.count++;
  return { allowed: true };
}

export function withRateLimit(handler: Function, limit?: number) {
  return async (request: Request, context: any) => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';

    // Bucket per ENDPOINT, not per IP alone: a global per-IP counter would let
    // a burst on ONE route (e.g. OTP resends) exhaust the allowance of every
    // other route (e.g. login) for the same caller.
    let route = 'unknown';
    try {
      route = new URL(request.url).pathname;
    } catch {
      /* non-URL request — fall back to a shared bucket */
    }
    const key = `${request.method} ${route}:${ip}`;

    const result = rateLimit(key, limit);

    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'طلبات كثيرة جداً. حاول بعد دقيقة',
            code: 'RATE_LIMITED',
          },
        },
        { status: 429 }
      );
    }

    return handler(request, context);
  };
}
