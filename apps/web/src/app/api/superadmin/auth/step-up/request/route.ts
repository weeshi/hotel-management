import { NextRequest } from 'next/server';
import { SuperAdminOtpService } from '@/lib/services/superadmin-otp.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import { maskEmail, SUDO_WINDOW_SECONDS } from '@/lib/utils/otp';
import { checkRateLimit } from '@/lib/rate-limiter';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { withPlatformAuth } from '@/middlewares/platform-auth';
import { withCsrf } from '@/middlewares/csrf';

const otpService = new SuperAdminOtpService();

// Strict distributed ceiling: a signed-in owner can request a step-up email
// at most 3 times per 15 minutes. Fail-OPEN like /verify-otp — the service's
// single-live-challenge rule is the authoritative floor.
const REQUEST_LIMIT = 3;
const REQUEST_WINDOW_SECONDS = 900;

/**
 * POST /api/superadmin/auth/step-up/request — first half of SA.6 Sudo Mode.
 *
 * Issues a step-up OTP to the email of an ALREADY authenticated & 2FA-verified
 * Super-Admin. Unlike login, identity is anchored to the verified session
 * (`request.user.userId` from `withPlatformAuth`, `tv:true` required), so a
 * fresh session can never be used to spam the owner's inbox — the caller has
 * already passed password + OTP. The challenge dies at `getStepUpTtlSeconds()`
 * (hard-capped 300s) so the code can never outlive the 5-minute sudo window.
 * See docs/SUPER-ADMIN-ARCH.md §SA.6.
 */
async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    try {
      const rl = await checkRateLimit(
        `stepup:request:${ip ?? 'unknown'}:${user.userId}`,
        REQUEST_LIMIT,
        REQUEST_WINDOW_SECONDS
      );
      if (!rl.allowed) {
        return errorResponse('محاولات كثيرة — حاول بعد قليل', 429, 'RATE_LIMITED');
      }
    } catch (err) {
      console.error(
        '[SUPER-ADMIN STEP-UP] Redis limiter unavailable, using service floor:',
        (err as Error).message
      );
    }

    const result = await otpService.requestStepUpOtp({ userId: user.userId, ip, userAgent });

    await recordPlatformAudit({
      actorUserId: user.userId,
      action: 'STEP_UP_OTP_REQUESTED',
      entity: 'OTP_CHALLENGE',
      entityId: result.challengeId,
      ip,
      userAgent,
    });

    return successResponse({
      expiresIn: SUDO_WINDOW_SECONDS,
      expiresAt: result.expiresAt,
      sendToEmail: maskEmail(result.email),
    });
  } catch (error: any) {
    return errorResponse(
      error.message || 'فشل طلب رمز التحقق',
      error.statusCode || 400,
      error.code
    );
  }
}

export const POST = withPlatformAuth(withCsrf(handler));