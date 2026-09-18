import { NextRequest, NextResponse } from 'next/server';
import {
  SuperAdminOtpService,
  type OtpResendReason,
} from '@/lib/services/superadmin-otp.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { signOtpChallengeToken, verifyOtpChallengeToken } from '@/lib/utils/jwt';
import { getOtpTtlSeconds, maskEmail } from '@/lib/utils/otp';
import { checkRateLimit } from '@/lib/rate-limiter';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withCsrf } from '@/middlewares/csrf';

const otpService = new SuperAdminOtpService();

const OTP_COOKIE = 'sa_otp';
// Path `/` (SA.5): must be readable by the `/superadmin/otp` Server Component
// AND received by this `/api/superadmin/auth/*` route — see login route notes.
const OTP_COOKIE_PATH = '/';

const RESEND_RATE_LIMIT = 3;
const RESEND_WINDOW_SECONDS = 300;

const FAILURE_MAP: Record<OtpResendReason, { status: number; message: string }> = {
  INVALID_CHALLENGE: { status: 401, message: 'جلسة التحقق غير صالحة — أعد تسجيل الدخول' },
  EXPIRED: { status: 410, message: 'انتهت صلاحية جلسة التحقق — أعد تسجيل الدخول' },
  CONSUMED: { status: 409, message: 'تم استخدام هذه الجلسة من قبل — أعد تسجيل الدخول' },
  LOCKED: { status: 423, message: 'الحساب مقفل مؤقتاً — حاول لاحقاً' },
  COOLDOWN: { status: 429, message: 'تم إرسال الرمز مؤخراً — حاول بعد قليل' },
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
 * POST /api/superadmin/auth/resend-otp — re-issue the OTP for a live, pending
 * Super-Admin login challenge (SA.2.5 — docs/SUPER-ADMIN-ARCH.md §5.7).
 *
 * Identity is anchored to the `sa_otp` challenge cookie, NOT to an email in the
 * body: only a browser that already passed factor 1 (password) can trigger a
 * resend, so this endpoint can never be used as an unauthenticated spam/DoS
 * vector against the platform owner's inbox, and it leaks no account
 * enumeration signal. The old code dies instantly (new codeHash), the attempt
 * budget resets, the pending-session window extends, and the cookie is re-issued
 * with the new expiry.
 */
async function handler(request: NextRequest) {
  try {
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

    // Strict per-{ip,user} distributed ceiling (3 per 5 min). Deliberately
    // fail-OPEN exactly like /verify-otp: the per-challenge cooldown in the
    // service is the authoritative DB floor, so a Redis outage cannot unlock
    // the spam surface nor lock the owner out.
    try {
      const rl = await checkRateLimit(
        `otp:resend:${ip ?? 'unknown'}:${userId}`,
        RESEND_RATE_LIMIT,
        RESEND_WINDOW_SECONDS
      );
      if (!rl.allowed) {
        return errorResponse('محاولات كثيرة — حاول بعد قليل', 429, 'RATE_LIMITED');
      }
    } catch (err) {
      console.error(
        '[SUPER-ADMIN OTP] Redis limiter unavailable, using DB cooldown floor:',
        (err as Error).message
      );
    }

    const result = await otpService.resendOtp({
      userId,
      challengeId: payload.challengeId,
      ip,
      userAgent,
    });

    if (!result.ok) {
      await recordPlatformAudit({
        actorUserId: userId,
        action: `SUPER_ADMIN_OTP_RESEND_FAILED_${result.reason}`,
        entity: 'OTP_CHALLENGE',
        entityId: payload.challengeId,
        ip,
        userAgent,
      });

      const mapped = FAILURE_MAP[result.reason];
      const response = errorResponse(mapped.message, mapped.status, result.reason);
      if (result.reason === 'COOLDOWN' && result.retryAfterSeconds) {
        response.headers.set('Retry-After', String(result.retryAfterSeconds));
      }
      if (result.reason === 'EXPIRED' || result.reason === 'INVALID_CHALLENGE') {
        clearChallengeCookie(response);
      }
      return response;
    }

    await recordPlatformAudit({
      actorUserId: userId,
      actorEmail: result.email,
      action: 'SUPER_ADMIN_OTP_RESENT',
      entity: 'OTP_CHALLENGE',
      entityId: payload.challengeId,
      ip,
      userAgent,
    });

    // Re-issue the challenge cookie with the extended session window so the
    // pending 2FA session stays alive for the new code's lifetime.
    const challengeToken = await signOtpChallengeToken({
      userId,
      challengeId: payload.challengeId,
      purpose: 'SUPER_ADMIN_LOGIN',
      expiresAt: result.expiresAt,
    });

    const response = successResponse({
      email: maskEmail(result.email),
      expiresIn: getOtpTtlSeconds(),
    });

    response.cookies.set(OTP_COOKIE, challengeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: OTP_COOKIE_PATH,
      maxAge: Math.max(
        Math.floor((result.expiresAt.getTime() - Date.now()) / 1000),
        1
      ),
    });

    return response;
  } catch (error: any) {
    return errorResponse(
      error.message || 'فشل إعادة إرسال الرمز',
      error.statusCode || 400,
      error.code
    );
  }
}

export const POST = withCsrf(handler);