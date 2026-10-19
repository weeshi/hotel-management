import { NextRequest } from 'next/server';
import { ZodError, z } from 'zod';
import {
  SuperAdminOtpService,
  type StepUpOtpVerifyResult,
} from '@/lib/services/superadmin-otp.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { signSudoToken } from '@/lib/utils/jwt';
import { SUDO_WINDOW_SECONDS } from '@/lib/utils/otp';
import { checkRateLimit } from '@/lib/rate-limiter';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withPlatformAuth } from '@/middlewares/platform-auth';
import { withCsrf } from '@/middlewares/csrf';

const otpService = new SuperAdminOtpService();

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام'),
});

const FAILURE_MAP = {
  INVALID: { status: 401, message: 'رمز التحقق غير صحيح' },
  INVALID_CHALLENGE: { status: 401, message: 'لا توجد جلسة تحقق نشطة — أعد طلب الرمز' },
  EXPIRED: { status: 410, message: 'انتهت صلاحية الرمز — أعد طلب الرمز' },
  CONSUMED: { status: 409, message: 'تم استخدام هذا الرمز من قبل — أعد طلب الرمز' },
  EXHAUSTED: { status: 423, message: 'تم تجاوز عدد المحاولات — تم قفل الحساب مؤقتاً' },
} as const;

// Stricter than login verify (10/60s): step-up gold must not be grindable while
// the attacker already holds a live session. Fail-OPEN — the DB attempt cap +
// account lock remain authoritative.
const VERIFY_LIMIT = 5;
const VERIFY_WINDOW_SECONDS = 60;

/**
 * POST /api/superadmin/auth/step-up/verify — second half of SA.6 Sudo Mode.
 *
 * Redeems the emailed step-up code (located by `userId + purpose`, the session
 * is the anchor — no cookie) for a short-lived, scoped, stateless `su_token`
 * (`scope: superadmin:integrations`, 5-minute window-use Sudo Mode).
 * On success the OTP challenge is consumed (OTP single-use), while the token
 * itself remains window-use — unlimited sensitive calls within 5 minutes.
 * See docs/SUPER-ADMIN-ARCH.md §SA.6.
 */
async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = verifySchema.parse(body);

    const user = (request as any).user;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    try {
      const rl = await checkRateLimit(
        `stepup:verify:${ip ?? 'unknown'}:${user.userId}`,
        VERIFY_LIMIT,
        VERIFY_WINDOW_SECONDS
      );
      if (!rl.allowed) {
        return errorResponse('محاولات كثيرة — حاول بعد قليل', 429, 'RATE_LIMITED');
      }
    } catch (err) {
      console.error(
        '[SUPER-ADMIN STEP-UP] Redis limiter unavailable, using DB attempt floor:',
        (err as Error).message
      );
    }

    const result: StepUpOtpVerifyResult = await otpService.verifyStepUpOtp({
      userId: user.userId,
      code,
      ip,
      userAgent,
    });

    if (!result.ok) {
      await recordPlatformAudit({
        actorUserId: user.userId,
        action: `STEP_UP_OTP_FAILED_${result.reason}`,
        entity: 'OTP_CHALLENGE',
        entityId: result.challengeId,
        ip,
        userAgent,
      });

      const mapped = FAILURE_MAP[result.reason];
      return errorResponse(mapped.message, mapped.status, result.reason);
    }

    await recordPlatformAudit({
      actorUserId: user.userId,
      actorEmail: result.user.email,
      action: 'STEP_UP_OTP_VERIFIED',
      entity: 'SUPER_ADMIN_AUTH',
      entityId: result.challengeId,
      ip,
      userAgent,
    });

    const sudoToken = await signSudoToken({ userId: user.userId });

    return successResponse({
      sudoToken,
      expiresIn: SUDO_WINDOW_SECONDS,
      expiresAt: new Date(Date.now() + SUDO_WINDOW_SECONDS * 1000),
    });
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

export const POST = withPlatformAuth(withCsrf(handler));