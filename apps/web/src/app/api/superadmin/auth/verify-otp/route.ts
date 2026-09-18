import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { AuthService } from '@/lib/services/auth.service';
import {
  SuperAdminOtpService,
  type OtpVerifyReason,
} from '@/lib/services/superadmin-otp.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { verifyOtpChallengeToken } from '@/lib/utils/jwt';
import { checkRateLimit } from '@/lib/rate-limiter';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withCsrf } from '@/middlewares/csrf';

const authService = new AuthService();
const otpService = new SuperAdminOtpService();

const OTP_COOKIE = 'sa_otp';
// Path `/` (SA.5): must be readable by the `/superadmin/otp` Server Component
// AND received by this `/api/superadmin/auth/*` route — see login route notes.
const OTP_COOKIE_PATH = '/';

const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام'),
});

const FAILURE_MAP: Record<OtpVerifyReason, { status: number; message: string }> = {
  INVALID: { status: 401, message: 'رمز التحقق غير صحيح' },
  INVALID_CHALLENGE: { status: 401, message: 'جلسة التحقق غير صالحة — أعد تسجيل الدخول' },
  EXPIRED: { status: 410, message: 'انتهت صلاحية الرمز — أعد تسجيل الدخول' },
  CONSUMED: { status: 409, message: 'تم استخدام هذا الرمز من قبل' },
  EXHAUSTED: { status: 423, message: 'تم تجاوز عدد المحاولات — تم قفل الحساب مؤقتاً' },
};

function clearChallengeCookie(response: NextResponse): NextResponse {
  response.cookies.set(OTP_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: OTP_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

/**
 * POST /api/superadmin/auth/verify-otp — second factor of the Super-Admin 2FA
 * flow. Redeems the `sa_otp` challenge cookie + emailed code for a real session
 * whose access token carries `tv: true` (verified-two-factor).
 * See docs/SUPER-ADMIN-ARCH.md §5.3/§5.5.
 */
async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = otpSchema.parse(body);

    const cookieToken = request.cookies.get(OTP_COOKIE)?.value;
    if (!cookieToken) {
      return errorResponse(
        'لا توجد جلسة تحقق صالحة — أعد تسجيل الدخول',
        401,
        'CHALLENGE_MISSING'
      );
    }

    let payload;
    try {
      payload = await verifyOtpChallengeToken(cookieToken);
    } catch {
      return clearChallengeCookie(
        errorResponse('انتهت صلاحية جلسة التحقق — أعد تسجيل الدخول', 401, 'CHALLENGE_INVALID')
      );
    }

    if (payload.scope !== 'superadmin:otp' || !payload.challengeId || !payload.sub) {
      return clearChallengeCookie(
        errorResponse('جلسة تحقق غير صالحة', 401, 'CHALLENGE_INVALID')
      );
    }

    const userId = payload.sub;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    // Best-effort distributed ceiling (Redis sliding window). Deliberately
    // fail-OPEN: the authoritative per-challenge attempt cap + account lock in
    // the service still hold if Redis is down, and fail-closed would let a
    // Redis outage lock the platform owner out of their own account.
    try {
      const rl = await checkRateLimit(`otp:verify:${ip ?? 'unknown'}:${userId}`, 10, 60);
      if (!rl.allowed) {
        return errorResponse('محاولات كثيرة — حاول بعد قليل', 429, 'RATE_LIMITED');
      }
    } catch (err) {
      console.error(
        '[SUPER-ADMIN OTP] Redis limiter unavailable, using DB attempt floor:',
        (err as Error).message
      );
    }

    const result = await otpService.verifyOtp({
      userId,
      challengeId: payload.challengeId,
      code,
      ip,
    });

    if (!result.ok) {
      await recordPlatformAudit({
        actorUserId: userId,
        action: `SUPER_ADMIN_OTP_FAILED_${result.reason}`,
        entity: 'OTP_CHALLENGE',
        entityId: payload.challengeId,
        ip,
        userAgent,
      });

      const mapped = FAILURE_MAP[result.reason];
      const response = errorResponse(mapped.message, mapped.status, result.reason);
      if (result.reason === 'EXPIRED' || result.reason === 'EXHAUSTED') {
        clearChallengeCookie(response);
      }
      return response;
    }

    const session = await authService.issueSession(result.user, { tv: true });

    await recordPlatformAudit({
      actorUserId: userId,
      actorEmail: result.user.email,
      action: 'SUPER_ADMIN_LOGIN_SUCCESS',
      entity: 'SUPER_ADMIN_AUTH',
      entityId: payload.challengeId,
      ip,
      userAgent,
    });

    const response = successResponse({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    });

    response.cookies.set('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });

    response.cookies.set('accessToken', session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    clearChallengeCookie(response);

    return response;
  } catch (error: any) {
    if (error instanceof ZodError) {
      return errorResponse(error.errors.map((e) => e.message).join('، '), 422);
    }
    return errorResponse(
      error.message || 'فشل التحقق من الرمز',
      error.statusCode || 400,
      error.code
    );
  }
}

export const POST = withCsrf(handler);
