import { createHmac, randomInt, timingSafeEqual } from 'crypto';

// Super-Admin Email OTP crypto primitives — docs/SUPER-ADMIN-ARCH.md §5.2/§5.4.
//
// The 6-digit code is NEVER stored in plaintext. We persist an HMAC-SHA256
// digest keyed by a platform secret (`SUPERADMIN_OTP_SECRET`) and bound to the
// userId + purpose. HMAC (not bcrypt/argon2) is deliberate: the code space is
// only 10^6, so a plain salted hash would be offline-bruteforceable if the DB
// leaked; HMAC requires the secret pepper, and is cheap (no CPU-DoS surface).

const DEV_OTP_SECRET = 'dev-superadmin-otp-min-32-chars-long!!';

export function getOtpSecret(): string {
  return process.env.SUPERADMIN_OTP_SECRET || DEV_OTP_SECRET;
}

export function getOtpTtlSeconds(): number {
  const parsed = Number(process.env.SUPERADMIN_OTP_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}

export function getOtpMaxAttempts(): number {
  const parsed = Number(process.env.SUPERADMIN_OTP_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

/**
 * Sudo Mode window (SA.6) — the Step-up OTP and the issued `su_token` must BOTH
 * die at 5 minutes so the emailed code can NEVER outlive the sudo window.
 */
export const SUDO_WINDOW_SECONDS = 300;

/**
 * Step-up OTP TTL (seconds). Hard-capped at `SUDO_WINDOW_SECONDS` (5 min):
 * unlike the login code (default 600 via `SUPERADMIN_OTP_TTL_SECONDS`), a
 * step-up code MUST NOT live longer than the sudo window — otherwise the window
 * silently stretches to 10 minutes (docs/SUPER-ADMIN-ARCH.md §SA.6).
 */
export function getStepUpTtlSeconds(): number {
  const parsed = Number(process.env.SUPERADMIN_STEP_UP_OTP_TTL_SECONDS);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : SUDO_WINDOW_SECONDS;
  return Math.min(base, SUDO_WINDOW_SECONDS);
}

/** Minimum seconds between two OTP emails for the same challenge (default 60). */
export function getOtpResendCooldownSeconds(): number {
  const parsed = Number(process.env.SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
}

/** Cryptographically-random 6-digit code, zero-padded. Never Math.random(). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** HMAC-SHA256 hex digest bound to the user, purpose and code. */
export function hashOtpCode(userId: string, purpose: string, code: string): string {
  return createHmac('sha256', getOtpSecret())
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Partially masks an email for display: `owner@site.com` -> `ow***@site.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
