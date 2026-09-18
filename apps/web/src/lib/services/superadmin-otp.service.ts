import { prisma } from '@/lib/utils/prisma';
import { sendEmail } from '@/lib/gateways/email.gateway';
import {
  SUDO_WINDOW_SECONDS,
  generateOtpCode,
  getOtpMaxAttempts,
  getOtpResendCooldownSeconds,
  getOtpTtlSeconds,
  getStepUpTtlSeconds,
  hashOtpCode,
  maskEmail,
  safeEqualHex,
} from '@/lib/utils/otp';
import { UnauthorizedError } from '@/lib/utils/errors';

const LOGIN_PURPOSE = 'SUPER_ADMIN_LOGIN' as const;
const STEP_UP_PURPOSE = 'SUPER_ADMIN_STEP_UP' as const;
const ACCOUNT_LOCK_MINUTES = 15;

export type OtpVerifyReason =
  | 'INVALID'
  | 'INVALID_CHALLENGE'
  | 'EXPIRED'
  | 'CONSUMED'
  | 'EXHAUSTED';

export type OtpVerifyResult =
  | { ok: true; user: any }
  | { ok: false; reason: OtpVerifyReason };

export type OtpResendReason =
  | 'INVALID_CHALLENGE'
  | 'EXPIRED'
  | 'CONSUMED'
  | 'LOCKED'
  | 'COOLDOWN';

export type OtpResendResult =
  | { ok: true; expiresAt: Date; email: string }
  | { ok: false; reason: OtpResendReason; retryAfterSeconds?: number };

export type StepUpOtpVerifyResult =
  | { ok: true; user: any; challengeId: string }
  | { ok: false; reason: OtpVerifyReason; challengeId?: string };

interface RequestOtpParams {
  userId: string;
  ip?: string;
  userAgent?: string;
  /**
   * SA.6 — override the login TTL. A step-up challenge is forced to
   * `getStepUpTtlSeconds()` (max 300) so the code can never outlive the 5-minute
   * sudo window. Login path keeps using `getOtpTtlSeconds()` by default.
   */
  customTtl?: number;
}

/**
 * Super-Admin Email OTP lifecycle — docs/SUPER-ADMIN-ARCH.md §5.
 *
 * The plaintext code exists only in memory and inside the outbound email. The
 * DB sees an HMAC digest only. Challenges are single-use, short-lived and
 * attempt-limited, and exhausting one escalates to a temporary account lock so
 * an attacker cannot "cycle" fresh challenges by re-submitting the password.
 */
export class SuperAdminOtpService {
  /**
   * Issues a new login challenge for a Super-Admin and emails the code.
   * Any previous un-consumed login challenge for this user is invalidated first,
   * so at most one code is live at a time.
   */
  async requestOtp({ userId, ip, userAgent, customTtl }: RequestOtpParams) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedError('حساب غير صالح');
    }

    await prisma.otpChallenge.updateMany({
      where: { userId, purpose: LOGIN_PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const ttlSeconds = customTtl ?? getOtpTtlSeconds();
    const code = generateOtpCode();
    const challenge = await prisma.otpChallenge.create({
      data: {
        userId,
        purpose: LOGIN_PURPOSE,
        codeHash: hashOtpCode(userId, LOGIN_PURPOSE, code),
        sentTo: user.email,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        maxAttempts: getOtpMaxAttempts(),
        ip,
        userAgent,
      },
    });

    await this.deliverCode({ to: user.email, code, ttlSeconds });

    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  /**
   * SA.6 — issues a Step-up OTP for an ALREADY VERIFIED session (Sudo Mode).
   *
   * Unlike login challenges (anchored to the `sa_otp` cookie), a step-up
   * challenge is anchored to the authenticated session (`userId`). Its purpose
   * (`SUPER_ADMIN_STEP_UP`) and TTL (hard-capped at 300s) are what make it die
   * WITH the 5-minute sudo window — the TTL mismatch trap fixed in SA.6.
   */
  async requestStepUpOtp(params: { userId: string; ip?: string; userAgent?: string }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedError('حساب غير صالح');
    }

    // At most one live step-up challenge per user — a new request kills the old.
    await prisma.otpChallenge.updateMany({
      where: { userId: params.userId, purpose: STEP_UP_PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const ttlSeconds = getStepUpTtlSeconds();
    const code = generateOtpCode();
    const challenge = await prisma.otpChallenge.create({
      data: {
        userId: params.userId,
        purpose: STEP_UP_PURPOSE,
        codeHash: hashOtpCode(params.userId, STEP_UP_PURPOSE, code),
        sentTo: user.email,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        maxAttempts: getOtpMaxAttempts(),
        ip: params.ip,
        userAgent: params.userAgent,
      },
    });

    await this.deliverCode({
      to: user.email,
      code,
      ttlSeconds,
      template: 'step-up',
    });

    return { challengeId: challenge.id, expiresAt: challenge.expiresAt, email: user.email };
  }

  private async deliverCode(params: {
    to: string;
    code: string;
    ttlSeconds: number;
    template?: 'login' | 'step-up';
  }) {
    const minutes = Math.round(params.ttlSeconds / 60);
    const isStepUp = params.template === 'step-up';
    const title = isStepUp ? 'تأكيد إجراء حساس' : 'تسجيل الدخول إلى حساب مالك المنصة';
    const intro = isStepUp
      ? 'قمت بطلب تأكيد إضافي لتنفيذ إجراء حساس (مثل تعديل مفاتيح بوابات الدفع). أدخل الرمز أدناه لتأكيد هويتك — يبقى صالحاً لمدة 5 دقائق فقط.'
      : 'رمز التحقق لتسجيل الدخول إلى حساب مالك المنصة';
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#1F2937;padding:20px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:20px;">لوحة تحكم المنصة</h1>
      </td></tr>
      <tr><td style="padding:30px;text-align:center;">
        <p style="font-size:16px;color:#333;margin:0 0 16px;">${title}</p>
        <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.7;">${intro}</p>
        <p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#111;margin:12px 0;font-family:monospace;">${params.code}</p>
        <p style="font-size:14px;color:#666;margin:16px 0 0;">صالح لمدة ${minutes} دقيقة${isStepUp ? ' (حصراً)' : ''}. لا تشارك هذا الرمز مع أي شخص.</p>
        <p style="font-size:13px;color:#999;margin:16px 0 0;">إن لم تطلب هذا الرمز فتجاهل الرسالة وضعّف كلمة المرور فوراً.</p>
      </td></tr>
      <tr><td style="background:#f8f8f8;padding:16px;text-align:center;font-size:12px;color:#999;">
        هذا بريد إلكتروني تلقائي — يرجى عدم الرد عليه.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

    await sendEmail({
      to: params.to,
      subject: `رمز التحقق — ${maskEmail(params.to)}`,
      html,
    });
  }

  /**
   * Re-issues the OTP for a live login challenge (SA.2.5 — docs §5.7).
   *
   * Identity is anchored to the `sa_otp` pending-challenge cookie: the caller
   * must already possess the challenge that only password success mints, so this
   * endpoint is NEVER an unauthenticated email-spam lookout. Enforcement layers:
   *   1. challenge exists, unconsumed, unexpired, user unlocked;
   *   2. per-challenge cooldown floor (DB-authoritative): the previous email is
   *      at least `getOtpResendCooldownSeconds()` seconds old, else `COOLDOWN`;
   *   3. a distributed per-{ip,user} ceiling (3/5 min, fail-open) lives in the
   *      route — the DB cooldown remains the authoritative floor either way.
   *
   * Mutation is atomic on the SAME challenge row (no new row, no orphaned id):
   * the old `codeHash` is overwritten (old code dies instantly), `attempts` is
   * reset so the fresh code gets a full guess budget, `expiresAt` extends the
   * pending-session window, and `lastCodeSentAt` feeds the next cooldown test.
   */
  async resendOtp(params: {
    userId: string;
    challengeId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<OtpResendResult> {
    const { userId, challengeId } = params;

    const challenge = await prisma.otpChallenge.findFirst({
      where: { id: challengeId, userId, purpose: LOGIN_PURPOSE },
    });

    if (!challenge) return { ok: false, reason: 'INVALID_CHALLENGE' };
    if (challenge.consumedAt) return { ok: false, reason: 'CONSUMED' };

    if (challenge.expiresAt < new Date()) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false, reason: 'EXPIRED' };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, reason: 'INVALID_CHALLENGE' };
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return { ok: false, reason: 'LOCKED' };
    }

    const cooldownSeconds = getOtpResendCooldownSeconds();
    if (cooldownSeconds > 0) {
      const lastSent = challenge.lastCodeSentAt ?? challenge.createdAt;
      const elapsedMs = Date.now() - lastSent.getTime();
      if (elapsedMs < cooldownSeconds * 1000) {
        return {
          ok: false,
          reason: 'COOLDOWN',
          retryAfterSeconds: Math.ceil((cooldownSeconds * 1000 - elapsedMs) / 1000),
        };
      }
    }

    const ttlSeconds = getOtpTtlSeconds();
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        codeHash: hashOtpCode(userId, LOGIN_PURPOSE, code),
        attempts: 0,
        expiresAt,
        lastCodeSentAt: new Date(),
        ip: params.ip ?? challenge.ip,
        userAgent: params.userAgent ?? challenge.userAgent,
      },
    });

    await this.deliverCode({ to: user.email, code, ttlSeconds });

    return { ok: true, expiresAt, email: user.email };
  }

  /**
   * Verifies a submitted code against the stored challenge.
   *
   * Enforcement layers (defence in depth — see the rate-limit note §5.5):
   *  1. challenge must exist, be unconsumed and unexpired;
   *  2. per-challenge `attempts` cap (authoritative floor);
   *  3. exhausting a challenge consumes it AND locks the account for 15 min,
   *     which defeats "re-login to get a fresh 5 guesses" cycling;
   *  4. a best-effort distributed (Redis) limiter in the route adds a ceiling.
   */
  async verifyOtp(params: {
    userId: string;
    challengeId: string;
    code: string;
    ip?: string;
  }): Promise<OtpVerifyResult> {
    const { userId, challengeId, code } = params;

    const challenge = await prisma.otpChallenge.findFirst({
      where: { id: challengeId, userId, purpose: LOGIN_PURPOSE },
    });

    if (!challenge) return { ok: false, reason: 'INVALID_CHALLENGE' };
    if (challenge.consumedAt) return { ok: false, reason: 'CONSUMED' };

    if (challenge.expiresAt < new Date()) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false, reason: 'EXPIRED' };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await this.consumeAndLock(challenge.id, userId);
      return { ok: false, reason: 'EXHAUSTED' };
    }

    const expected = hashOtpCode(userId, LOGIN_PURPOSE, code);
    if (!safeEqualHex(expected, challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      const exhausted = attempts >= challenge.maxAttempts;

      await prisma.$transaction(async (tx) => {
        await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            ...(exhausted ? { consumedAt: new Date() } : {}),
          },
        });
        if (exhausted) {
          await tx.user.update({
            where: { id: userId },
            data: {
              lockedUntil: new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000),
              failedLoginAttempts: 0,
            },
          });
        }
      });

      return { ok: false, reason: exhausted ? 'EXHAUSTED' : 'INVALID' };
    }

    await prisma.$transaction([
      prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { lastTwoFactorAt: new Date(), twoFactorMethod: 'EMAIL_OTP' },
      }),
    ]);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, reason: 'INVALID_CHALLENGE' };

    return { ok: true, user };
  }
  
  /**
   * Verifies a submitted code against the LIVE step-up challenge of a verified
   * session (SA.6 — Sudo Mode). Same attempt/lock enforcement as login
   * (`attempts` cap + account lock on exhaustion) but the challenge is located by
   * `userId + purpose` instead of a challenge cookie, because the session itself
   * is the anchor here. On success the challenge is consumed — although the
   * resulting `su_token` is WINDOW-use (unlimited sensitive calls in 5 minutes),
   * the OTP itself remains single-use.
   */
  async verifyStepUpOtp(params: {
    userId: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<StepUpOtpVerifyResult> {
    const { userId, code } = params;
  
    const challenge = await prisma.otpChallenge.findFirst({
      where: { userId, purpose: STEP_UP_PURPOSE, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  
    if (!challenge) return { ok: false, reason: 'INVALID_CHALLENGE' };
    if (challenge.consumedAt) return { ok: false, reason: 'CONSUMED', challengeId: challenge.id };
  
    if (challenge.expiresAt < new Date()) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false, reason: 'EXPIRED', challengeId: challenge.id };
    }
  
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.consumeAndLock(challenge.id, userId);
      return { ok: false, reason: 'EXHAUSTED', challengeId: challenge.id };
    }
  
    const expected = hashOtpCode(userId, STEP_UP_PURPOSE, code);
    if (!safeEqualHex(expected, challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      const exhausted = attempts >= challenge.maxAttempts;
  
      await prisma.$transaction(async (tx) => {
        await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            ...(exhausted ? { consumedAt: new Date() } : {}),
          },
        });
        if (exhausted) {
          await tx.user.update({
            where: { id: userId },
            data: {
              lockedUntil: new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000),
              failedLoginAttempts: 0,
            },
          });
        }
      });
  
      return {
        ok: false,
        reason: exhausted ? 'EXHAUSTED' : 'INVALID',
        challengeId: challenge.id,
      };
    }
  
    await prisma.$transaction([
      prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { lastTwoFactorAt: new Date(), twoFactorMethod: 'EMAIL_OTP' },
      }),
    ]);
  
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, reason: 'INVALID_CHALLENGE', challengeId: challenge.id };
  
    return { ok: true, user, challengeId: challenge.id };
  }
  
  private async consumeAndLock(challengeId: string, userId: string) {
    await prisma.$transaction([
      prisma.otpChallenge.updateMany({
        where: { id: challengeId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000),
          failedLoginAttempts: 0,
        },
      }),
    ]);
  }
}
