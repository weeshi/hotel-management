import { NextRequest, NextResponse } from 'next/server';
import { verifySudoToken } from '@/lib/utils/jwt';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';

/**
 * SA.6 Sudo-Mode gate (docs/SUPER-ADMIN-ARCH.md §SA.6) — a COMPOSITION layer
 * that runs AFTER `withPlatformAuth` (it needs `request.user.userId`).
 *
 * Single Responsibility: `withPlatformAuth` proves WHO the caller is; this
 * middleware proves the caller has RECENTLY re-proven an elevated permission
 * (step-up OTP → `su_token`). It is applied per-verb, so read-only endpoints
 * (GET /integrations) stay outside sudo while mutating endpoints (POST/DELETE)
 * are gated.
 *
 * Window-use semantics: the token is a 5-minute Sudo Mode, NOT single-use — the
 * Admin may reconfigure several payment gateways in one session. Expiry is
 * final (`403 STEP_UP_EXPIRED`); the UI must re-request a step-up OTP.
 *
 * The `su_token` is only meaningful TO this guard — it is scoped
 * (`superadmin:integrations`) and purpose-bound; `withPlatformAuth` never reads
 * it, so a stolen sudo token is useless for ordinary authenticated calls.
 */
export function withSudoMode(handler: Function) {
  return async (request: NextRequest, context: any) => {
    const rawToken = request.headers.get('x-sudo-token');

    if (!rawToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'هذا الإجراء يتطلب إعادة تحقق إضافية (Sudo Mode) — أعد التحقق أولاً',
            code: 'STEP_UP_REQUIRED',
          },
        },
        { status: 403 }
      );
    }

    const user = (request as any).user;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    let payload;
    try {
      payload = await verifySudoToken(rawToken);
    } catch {
      // Header was presented but could NOT be honored (expired, forged, bad
      // secret). Audit the rejection — only when the header exists, to keep
      // the ledger clean of noise from plain unsudoed requests.
      await recordPlatformAudit({
        actorUserId: user?.userId,
        action: 'STEP_UP_EXPIRED_REJECTED',
        entity: 'SUDO_MODE',
        ip,
        userAgent,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'انتهت صلاحية السودو مود — أعد التحقق للحصول على رمز جديد',
            code: 'STEP_UP_EXPIRED',
          },
        },
        { status: 403 }
      );
    }

    if (
      payload.scope !== 'superadmin:integrations' ||
      !payload.sub ||
      payload.sub !== user?.userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'سودو مود غير صالح لهذا الطلب — أعد التحقق أولاً',
            code: 'STEP_UP_REQUIRED',
          },
        },
        { status: 403 }
      );
    }

    await recordPlatformAudit({
      actorUserId: user.userId,
      action: 'STEP_UP_USED',
      entity: 'SUDO_MODE',
      entityId: payload.jti,
      newValue: `${request.method} ${request.nextUrl.pathname}`,
      ip,
      userAgent,
    });

    return handler(request, context);
  };
}