import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { loginSchema } from '@hotel/shared';
import { AuthService } from '@/lib/services/auth.service';
import { SuperAdminOtpService } from '@/lib/services/superadmin-otp.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { signOtpChallengeToken } from '@/lib/utils/jwt';
import { getOtpTtlSeconds, maskEmail } from '@/lib/utils/otp';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withRateLimit } from '@/middlewares/rate-limit';

const authService = new AuthService();
const otpService = new SuperAdminOtpService();

const OTP_COOKIE = 'sa_otp';
const OTP_COOKIE_PATH = '/api/superadmin/auth';

/**
 * POST /api/superadmin/auth/login — first factor of the Super-Admin 2FA flow.
 *
 * Verifies the password but NEVER issues a session. On success it sends a
 * 6-digit OTP and returns a short-lived, scoped challenge cookie (`sa_otp`).
 * The real access/refresh pair is only minted by /verify-otp.
 * See docs/SUPER-ADMIN-ARCH.md §5.1.
 */
async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const user = await authService.authenticateCredentials(
      validated.email,
      validated.password
    );

    // Wrong account type -> answer exactly like a bad password (no enumeration).
    if (user.role !== 'SUPER_ADMIN') {
      return errorResponse('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401, 'UNAUTHORIZED');
    }

    // Platform owner accounts must have 2FA; refuse rather than silently
    // downgrade to single-factor (docs/SUPER-ADMIN-ARCH.md §5.1).
    if (!user.twoFactorEnabled) {
      await recordPlatformAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'SUPER_ADMIN_LOGIN_BLOCKED_NO_2FA',
        entity: 'SUPER_ADMIN_AUTH',
        ip,
        userAgent,
      });
      return errorResponse(
        'المصادقة الثنائية غير مفعّلة لحساب المنصة. تواصل مع مسؤول النظام',
        403,
        'TWO_FACTOR_NOT_ENABLED'
      );
    }

    const { challengeId, expiresAt } = await otpService.requestOtp({
      userId: user.id,
      ip,
      userAgent,
    });

    const challengeToken = await signOtpChallengeToken({
      userId: user.id,
      challengeId,
      purpose: 'SUPER_ADMIN_LOGIN',
      expiresAt,
    });

    await recordPlatformAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'SUPER_ADMIN_LOGIN_OTP_SENT',
      entity: 'OTP_CHALLENGE',
      entityId: challengeId,
      ip,
      userAgent,
    });

    const response = successResponse({
      otpRequired: true,
      email: maskEmail(user.email),
      expiresIn: getOtpTtlSeconds(),
    });

    response.cookies.set(OTP_COOKIE, challengeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: OTP_COOKIE_PATH,
      maxAge: Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1),
    });

    return response;
  } catch (error: any) {
    if (error instanceof ZodError) {
      return errorResponse(error.errors.map((e) => e.message).join('، '), 422);
    }
    return errorResponse(
      error.message || 'فشل تسجيل الدخول',
      error.statusCode || 400,
      error.code
    );
  }
}

// Coarse, per-IP guard on top of the per-account lockout. The distributed,
// account-aware limiter lives on /verify-otp (docs/SUPER-ADMIN-ARCH.md §5.5).
export const POST = withRateLimit(handler, 10);
