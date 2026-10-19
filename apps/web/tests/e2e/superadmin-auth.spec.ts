/**
 * E2E.1.5 — Super-Admin Email-OTP UI journey (Playwright + Prisma Injection).
 *
 * InfoSec-mandated architecture (docs/E2E-TESTING-ARCH.md): ZERO production code
 * is modified for the sake of testing. The emailed 6-digit code is never read
 * and no `/api/test/*` backdoor exists. Because the Playwright runtime is Node,
 * it talks to the E2E database directly and patches the live `OtpChallenge`
 * `codeHash` to a known value (Option C), exactly like the backend harness
 * `scripts/test-superadmin-otp.ts`.
 *
 * State isolation: every test starts from a fresh browser context (no
 * `storageState`) and `beforeEach` wipes OtpChallenges + refresh tokens, so no
 * session, cookie or cooldown can leak across tests.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createE2eClient } from './setup/db';
import { resetRateLimitKeys } from './setup/rate-limit';
import { hashOtpCode, getOtpResendCooldownSeconds } from '../../src/lib/utils/otp';

// Mirror the backend harness: load `.env` (if any) so the OTP HMAC secret we
// compute here always matches the Next server — `next start` auto-loads `.env`
// while a bare Playwright process does not. The secret is read lazily at
// `hashOtpCode()` call time, so loading after the module imports is safe.
function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env is optional — dev defaults apply */
  }
}
loadDotEnv();

const SUPER_ADMIN_EMAIL = 'super@hotel.com';
const SUPER_ADMIN_PASSWORD = 'superadmin123';
const FIXED_OTP_CODE = '123456';
const WRONG_OTP_CODE = '654321';
const OTP_PURPOSE = 'SUPER_ADMIN_LOGIN';
const RESEND_COOLDOWN_SECONDS = getOtpResendCooldownSeconds();

// Margin above the cooldown floor for the Dual Time Sync (handles the small
// skew between browser clock install time and the server-rendered unlock ts).
const TIME_MARGIN_MS = 2_000;

let prisma: PrismaClient;
let superAdminId = '';
let superAdminPasswordHash = '';

test.beforeAll(async () => {
  prisma = createE2eClient();
  superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

test.beforeEach(async () => {
  const user = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      password: superAdminPasswordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      twoFactorEnabled: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: SUPER_ADMIN_EMAIL,
      password: superAdminPasswordHash,
      name: 'المشرف العام — E2E',
      role: 'SUPER_ADMIN',
      twoFactorEnabled: true,
    },
  });
  superAdminId = user.id;

  await resetRateLimitKeys();

  // Fresh slate per test: no leftover challenges, sessions or lockouts.
  await prisma.otpChallenge.deleteMany({ where: { userId: superAdminId } });
  await prisma.refreshToken.deleteMany({ where: { userId: superAdminId } });
});

// ─── helpers ───────────────────────────────────────────────────────────────

/** Walks factor 1: fills credentials, submits, waits for the OTP screen. */
async function submitLogin(page: Page) {
  await page.goto('/superadmin/login');
  await page.getByTestId('superadmin-login-email').fill(SUPER_ADMIN_EMAIL);
  await page.getByTestId('superadmin-login-password').fill(SUPER_ADMIN_PASSWORD);
  await page.getByTestId('superadmin-login-submit').click();
  await expect(page).toHaveURL(/\/superadmin\/otp/);
  await expect(page.getByTestId('otp-input-0')).toBeVisible();
}

/** Returns the latest live challenge for the seeded Super Admin. */
async function liveChallenge() {
  return prisma.otpChallenge.findFirst({
    where: { userId: superAdminId, purpose: OTP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Prisma Injection (Option C): overwrite the challenge's HMAC `codeHash` so the
 * browser can type a known code. Returns the challenge row AFTER the patch.
 */
async function patchChallengeCode(code: string) {
  const challenge = await liveChallenge();
  expect(challenge, 'login must have minted an OtpChallenge').toBeTruthy();
  return prisma.otpChallenge.update({
    where: { id: challenge!.id },
    data: { codeHash: hashOtpCode(superAdminId, OTP_PURPOSE, code), attempts: 0 },
  });
}

/**
 * Real keystrokes instead of a bulk fill: `useOtpInput.setValueAt` slices the
 * value to a single char and auto-advances focus, so only per-key events (which
 * `page.keyboard.type` produces) drive the 6-box UX the way a user would.
 */
async function typeOtpCode(page: Page, code: string) {
  await page.getByTestId('otp-input-0').focus();
  await page.keyboard.type(code, { delay: 60 });
}

async function expectDashboard(page: Page) {
  await expect(page).toHaveURL(/\/superadmin\/?$/);
  await expect(page.getByTestId('superadmin-welcome')).toBeVisible();
  // The dashboard shell renders a sign-out button in the sidebar AND the mobile
  // header too, so scope to the main region (the welcome-card button).
  const logoutButton = page.getByRole('main').getByTestId('superadmin-logout-btn');
  await expect(logoutButton).toBeVisible();
  return logoutButton;
}

// ─── E2E.1.5 scenarios ─────────────────────────────────────────────────────

test.describe('Super Admin 2FA UI (E2E.1.5)', () => {
  test('middleware bounces unauthenticated /superadmin/* to /superadmin/login', async ({
    page,
  }) => {
    await page.goto('/superadmin/hotels');
    await expect(page).toHaveURL(/\/superadmin\/login/);
    await expect(page.getByTestId('superadmin-login-email')).toBeVisible();
  });

  test('full 2FA journey: password -> OTP screen -> known code -> dashboard', async ({
    page,
    context,
  }) => {
    await submitLogin(page);

    await patchChallengeCode(FIXED_OTP_CODE);
    await typeOtpCode(page, FIXED_OTP_CODE);

    await expectDashboard(page);

    // A real session was minted: HttpOnly access/refresh cookies exist and the
    // single-use challenge cookie `sa_otp` was cleared after redemption.
    const cookieNames = (await context.cookies()).map((c) => c.name);
    expect(cookieNames).toContain('accessToken');
    expect(cookieNames).toContain('refreshToken');
    expect(cookieNames).not.toContain('sa_otp');

    // Single-use guarantee: the redeemed challenge is consumed in the DB.
    const consumed = await prisma.otpChallenge.findMany({
      where: { userId: superAdminId, purpose: OTP_PURPOSE },
    });
    expect(consumed).toHaveLength(1);
    expect(consumed[0].consumedAt).not.toBeNull();
  });

  test('wrong code shows an error and does not leave the OTP screen', async ({ page }) => {
    await submitLogin(page);

    // Server knows a DIFFERENT code than the one we will type.
    await patchChallengeCode(WRONG_OTP_CODE);
    await typeOtpCode(page, FIXED_OTP_CODE);

    await expect(page.getByTestId('otp-error')).toBeVisible();
    await expect(page.getByTestId('otp-error')).toHaveText('رمز التحقق غير صحيح');
    await expect(page).toHaveURL(/\/superadmin\/otp/);

    // Backend registered the failed guess (+1 attempts) — proof the injection
    // is hitting the real verification path, not a mocked UI.
    await expect
      .poll(async () => (await liveChallenge())?.attempts)
      .toBe(1);
  });

  test('resend honours the cooldown and succeeds after the Dual Time Sync', async ({
    page,
  }) => {
    // Install the fake browser clock BEFORE any page script runs so the OTP
    // screen's 1s heartbeat is a fake timer we can drive — then resume it so the
    // login navigation keeps running naturally (Playwright docs recommend letting
    // the page load before pausing).
    await page.clock.install();
    await page.clock.resume();
    await submitLogin(page);

    const resendBtn = page.getByTestId('otp-resend-btn');

    // 1) Fresh challenge -> button disabled with a live countdown.
    await expect(resendBtn).toBeDisabled();
    await expect(resendBtn).toHaveText(/إعادة الإرسال بعد \d+ ث/);

    const challenge = await liveChallenge();
    expect(challenge).toBeTruthy();
    const originalCodeHash = challenge!.codeHash;

    // 2) Prisma Time Injection (server half): rewind the DB-authoritative
    //    cooldown floor so the backend WILL accept a resend.
    await prisma.otpChallenge.update({
      where: { id: challenge!.id },
      data: {
        lastCodeSentAt: new Date(Date.now() - (RESEND_COOLDOWN_SECONDS + 1) * 1000),
      },
    });

    // 3) Browser Clock Jump (client half): freeze the browser 2s past the
    //    unlock instant — the React countdown hits zero, enabling the button a
    //    real user needs to click. `pauseAt` fires due timers (the heartbeat)
    //    once, exactly like closing the laptop lid and reopening it later.
    await page.clock.pauseAt(
      Date.now() + (RESEND_COOLDOWN_SECONDS + 1) * 1000 + TIME_MARGIN_MS
    );
    await expect(resendBtn).toBeEnabled();
    await expect(resendBtn).toHaveText('إعادة إرسال الرمز');

    // 4) Click and assert the API accepted it: the old code died (codeHash
    //    rotated to a brand-new random digest) and the guess budget reset.
    await resendBtn.click();
    await expect
      .poll(async () => {
        const row = await prisma.otpChallenge.findUnique({ where: { id: challenge!.id } });
        return row?.codeHash;
      })
      .not.toBe(originalCodeHash);

    const after = await prisma.otpChallenge.findUnique({ where: { id: challenge!.id } });
    expect(after?.attempts).toBe(0);
    expect(after?.lastCodeSentAt).not.toBeNull();
    expect(after?.expiresAt.getTime()).toBeGreaterThan(challenge!.expiresAt.getTime());

    // No error surfaced in the UI after the accepted resend.
    await expect(page.getByTestId('otp-error')).toBeHidden();
  });

  test('logout revokes the session and sends repeat visits back to login', async ({
    page,
    context,
  }) => {
    await submitLogin(page);
    await patchChallengeCode(FIXED_OTP_CODE);
    await typeOtpCode(page, FIXED_OTP_CODE);
    const logoutButton = await expectDashboard(page);

    await logoutButton.click();
    await expect(page).toHaveURL(/\/superadmin\/login/);

    // Cookies are gone — no token can resurrect the session.
    const cookieNames = (await context.cookies()).map((c) => c.name);
    expect(cookieNames).not.toContain('accessToken');
    expect(cookieNames).not.toContain('refreshToken');

    // A fresh navigation to a protected page must bounce again to login.
    await page.goto('/superadmin');
    await expect(page).toHaveURL(/\/superadmin\/login/);
    await expect(page.getByTestId('superadmin-login-email')).toBeVisible();
  });
});