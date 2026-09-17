import { prisma } from '@/lib/utils/prisma';
import { sendEmail } from '@/lib/gateways/email.gateway';
import {
  generateOtpCode,
  getOtpMaxAttempts,
  getOtpTtlSeconds,
  hashOtpCode,
  maskEmail,
  safeEqualHex,
} from '@/lib/utils/otp';
import { UnauthorizedError } from '@/lib/utils/errors';

const LOGIN_PURPOSE = 'SUPER_ADMIN_LOGIN' as const;
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

interface RequestOtpParams {
  userId: string;
  ip?: string;
  userAgent?: string;
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
  async requestOtp({ userId, ip, userAgent }: RequestOtpParams) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedError('حساب غير صالح');
    }

    await prisma.otpChallenge.updateMany({
      where: { userId, purpose: LOGIN_PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const ttlSeconds = getOtpTtlSeconds();
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

  private async deliverCode(params: { to: string; code: string; ttlSeconds: number }) {
    const minutes = Math.round(params.ttlSeconds / 60);
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
        <p style="font-size:16px;color:#333;margin:0 0 16px;">رمز التحقق لتسجيل الدخول إلى حساب مالك المنصة</p>
        <p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#111;margin:12px 0;font-family:monospace;">${params.code}</p>
        <p style="font-size:14px;color:#666;margin:16px 0 0;">صالح لمدة ${minutes} دقيقة. لا تشارك هذا الرمز مع أي شخص.</p>
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
