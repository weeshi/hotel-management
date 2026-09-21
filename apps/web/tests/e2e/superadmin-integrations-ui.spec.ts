/**
 * E2E.1.7 — Super-Admin Integrations UI + Sudo Mode lifecycle (Playwright).
 *
 * Frontend for SA.7 (docs/SUPER-ADMIN-ARCH.md §SA.7): the `/superadmin/
 * integrations` page drives payment-gateway key management through the shared
 * `SudoProvider`/`useSudoMutation` client layer. Every mutating call is denied
 * by `withSudoMode` with `403 STEP_UP_REQUIRED`, the provider shows ONE OTP
 * modal, and after a successful step-up verify it replays the parked mutation
 * with `x-sudo-token`.
 *
 * Same InfoSec architecture as E2E.1.5/1.6 (docs/E2E-TESTING-ARCH.md): ZERO
 * production code for tests, no test backdoor, the emailed code is never read.
 * Playwright Prisma-Injects the live `SUPER_ADMIN_STEP_UP` challenge `codeHash`
 * to a known value; the dev-fallback sudo secret
 * (`dev-superadmin-stepup-min-32-chars-long!!`, jwt.ts) is the shared key
 * material — no env var is set in the E2E environment.
 *
 * Scenarios covered:
 *   1. Full Sudo lifecycle: save -> 403 -> modal -> Prisma OTP -> replay -> saved.
 *   2. Window-use cache: the second mutation skips OTP (5-minute su_token).
 *   3. Concurrency trap: TWO simultaneous credential saves resolve after ONE OTP.
 *   4. DELETE elevates too: modal -> OTP -> replay -> key row removed.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createE2eClient } from './setup/db';
import { hashOtpCode } from '../../src/lib/utils/otp';

// Mirror the backend harness + E2E.1.5/1.6: load `.env` so the HMAC secret we
// compute here always matches the `next start` server.
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
const FIXED_OTP_CODE = '159357';
const LOGIN_PURPOSE = 'SUPER_ADMIN_LOGIN';
const STEP_UP_PURPOSE = 'SUPER_ADMIN_STEP_UP';
const HOTEL_NAME = 'SA.7 E2E Hotel';

const PLUTU_SECRETS = { merchantId: 'plutu_mch_7', secretKey: 'sk_plutu_e2e_7' };
const TLYNC_SECRETS = { merchantId: 'tlync_mch_9', secretKey: 'sk_tlync_e2e_9' };

let prisma: PrismaClient;
let superAdminId = '';
let superAdminPasswordHash = '';
let hotelId = '';

test.beforeAll(async () => {
  prisma = createE2eClient();
  superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  let hotel = await prisma.hotel.findFirst({ where: { name: HOTEL_NAME } });
  if (!hotel) hotel = await prisma.hotel.create({ data: { name: HOTEL_NAME } });
  hotelId = hotel.id;
});

test.afterAll(async () => {
  await prisma?.integrationConfig.deleteMany({ where: { hotelId } });
  await prisma?.hotel.deleteMany({ where: { id: hotelId } });
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

  await prisma.otpChallenge.deleteMany({ where: { userId: superAdminId } });
  await prisma.refreshToken.deleteMany({ where: { userId: superAdminId } });
  await prisma.integrationConfig.deleteMany({ where: { hotelId } });
  await prisma.platformAuditLog.deleteMany({ where: { actorUserId: superAdminId } });
});

// ─── helpers ───────────────────────────────────────────────────────────────

async function submitLogin(page: Page) {
  await page.goto('/superadmin/login');
  await page.getByTestId('superadmin-login-email').fill(SUPER_ADMIN_EMAIL);
  await page.getByTestId('superadmin-login-password').fill(SUPER_ADMIN_PASSWORD);
  await page.getByTestId('superadmin-login-submit').click();
  await expect(page).toHaveURL(/\/superadmin\/otp/);
  await expect(page.getByTestId('otp-input-0')).toBeVisible();
}

async function patchLoginChallenge(code: string) {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId: superAdminId, purpose: LOGIN_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  expect(challenge, 'login must have minted an OtpChallenge').toBeTruthy();
  return prisma.otpChallenge.update({
    where: { id: challenge!.id },
    data: { codeHash: hashOtpCode(superAdminId, LOGIN_PURPOSE, code), attempts: 0 },
  });
}

async function typeOtpCode(page: Page, code: string) {
  await page.getByTestId('otp-input-0').focus();
  await page.keyboard.type(code, { delay: 50 });
}

/** Full 2FA login, land on the dashboard, then open the integrations page. */
async function loginAndOpenIntegrations(page: Page) {
  await submitLogin(page);
  await patchLoginChallenge(FIXED_OTP_CODE);
  await typeOtpCode(page, FIXED_OTP_CODE);
  await expect(page).toHaveURL(/\/superadmin\/?$/);
  await expect(page.getByTestId('superadmin-welcome')).toBeVisible();

  await page.goto('/superadmin/integrations');
  await expect(page.getByTestId('integrations-page')).toBeVisible();
  // The seeded hotel is auto-selected by the page; cards then render.
  await expect(page.getByTestId('hotel-selector')).toBeVisible();
  await expect(
    page.locator(`[data-testid="hotel-selector"] option`, { hasText: HOTEL_NAME })
  ).toHaveCount(1);
  await page.getByTestId('hotel-selector').selectOption({ label: HOTEL_NAME });
  await expect(page.getByTestId('engine-card-plutu')).toBeVisible();
  await expect(page.getByTestId('engine-card-tlync')).toBeVisible();
}

/** Prisma-Inject the live step-up challenge so the browser can type a known code. */
async function patchStepUpChallenge(code: string) {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId: superAdminId, purpose: STEP_UP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  expect(challenge, 'step-up flow must have minted a challenge').toBeTruthy();
  return prisma.otpChallenge.update({
    where: { id: challenge!.id },
    data: { codeHash: hashOtpCode(superAdminId, STEP_UP_PURPOSE, code), attempts: 0 },
  });
}

/** Waits for the modal, injects the code, types it, waits for elevation + replay. */
async function completeSudoOtp(page: Page) {
  const modal = page.getByTestId('stepup-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId('otp-input-0')).toBeVisible();

  await patchStepUpChallenge(FIXED_OTP_CODE);
  await modal.getByTestId('otp-input-0').focus();
  await page.keyboard.type(FIXED_OTP_CODE, { delay: 50 });

  // Elevation succeeded: the modal closes and the parked mutations replay.
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

/** Fills a gateway's credential inputs (the card must be in editable state). */
async function fillGatewaySecrets(page: Page, engine: 'plutu' | 'tlync', secrets: Record<string, string>) {
  for (const [field, value] of Object.entries(secrets)) {
    await page.getByTestId(`secret-${engine}-${field}`).fill(value);
  }
}

// ─── E2E.1.7 scenarios ─────────────────────────────────────────────────────

test.describe('Super Admin Integrations UI (E2E.1.7)', () => {
  test('full Sudo lifecycle: save -> 403 -> OTP modal -> Prisma code -> replay -> saved', async ({
    page,
  }) => {
    await loginAndOpenIntegrations(page);

    // Card state BEFORE any key exists: unlocked config, no Nokey badge on discard.
    await expect(page.getByTestId('nokey-badge-plutu')).toBeVisible();

    // 1) Save keys — backend refuses with STEP_UP_REQUIRED.
    await fillGatewaySecrets(page, 'plutu', PLUTU_SECRETS);
    await page.getByTestId('btn-save-plutu').click();

    // 2) The SudoProvider surfaced exactly one OTP modal with a masked inbox.
    const modal = page.getByTestId('stepup-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('otp-input-0')).toBeVisible();
    await expect(modal).toContainText(/su\*\*\*@hotel\.com/);

    // 3) Prisma Injection: the live step-up challenge now accepts our code.
    await patchStepUpChallenge(FIXED_OTP_CODE);

    // 4) Type the code — the verify POST succeeds, the modal closes and the
    //    original POST replays with the fresh su_token.
    await modal.getByTestId('otp-input-0').focus();
    await page.keyboard.type(FIXED_OTP_CODE, { delay: 50 });
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // 5) The key landed: «مُعدّ مسبقاً» badge + a DB row with an encrypted key.
    await expect(page.getByTestId('haskey-badge-plutu')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const row = await prisma.integrationConfig.findUnique({
          where: { hotelId_engine: { hotelId, engine: 'plutu' } },
        });
        return row?.apiKeyEnc ? true : false;
      })
      .toBe(true);

    // The step-up itself was consumed (single-use) and audited.
    const verifiedAudits = await prisma.platformAuditLog.count({
      where: { actorUserId: superAdminId, action: 'STEP_UP_OTP_VERIFIED' },
    });
    expect(verifiedAudits).toBe(1);
  });

  test('window-use cache: the second mutation in the 5-minute window skips OTP', async ({
    page,
  }) => {
    await loginAndOpenIntegrations(page);

    // First save elevates once.
    await fillGatewaySecrets(page, 'tlync', TLYNC_SECRETS);
    await page.getByTestId('btn-save-tlync').click();
    await completeSudoOtp(page);
    await expect(page.getByTestId('haskey-badge-tlync')).toBeVisible({ timeout: 15_000 });

    // Enabling the gateway is ALSO a sudo-gated POST — but the su_token is
    // cached, so no second OTP is requested.
    await page.getByTestId('switch-isactive-tlync').click();
    await page.getByTestId('btn-save-tlync').click();

    // No modal ever appeared for the second save…
    await expect(page.getByTestId('stepup-modal')).toHaveCount(0);
    // …the badge flipped to «مفعّل»…
    await expect(page.getByTestId('status-badge-tlync')).toHaveText('مفعّل', {
      timeout: 15_000,
    });
    // …and exactly ONE step-up was requested + verified for the two mutations.
    await expect
      .poll(async () =>
        prisma.platformAuditLog.count({
          where: { actorUserId: superAdminId, action: 'STEP_UP_OTP_VERIFIED' },
        })
      )
      .toBe(1);

    const row = await prisma.integrationConfig.findUnique({
      where: { hotelId_engine: { hotelId, engine: 'tlync' } },
    });
    expect(row?.isActive).toBe(true);
    expect(row?.apiKeyEnc).toBeTruthy();
  });

  test('concurrency trap: two simultaneous key saves resolve after ONE OTP', async ({
    page,
  }) => {
    await loginAndOpenIntegrations(page);

    // Slow the integrations API so BOTH POSTs are in flight before either 403
    // lands — the exact double-save race the frontend review flagged. The
    // step-up endpoints are NOT matched by this route, so OTP still flows fast.
    await page.route('**/api/superadmin/integrations', async (route) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
      await route.continue();
    });

    // Fire both mutations back-to-back; neither response has arrived yet.
    await fillGatewaySecrets(page, 'plutu', PLUTU_SECRETS);
    await fillGatewaySecrets(page, 'tlync', TLYNC_SECRETS);
    await page.getByTestId('btn-save-plutu').click();
    await page.getByTestId('btn-save-tlync').click();

    // A SINGLE modal — the lock kept the second 403 queued, not doubled up.
    const modal = page.getByTestId('stepup-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCount(1);
    await expect(modal.getByTestId('otp-input-0')).toBeVisible();

    await patchStepUpChallenge(FIXED_OTP_CODE);
    await modal.getByTestId('otp-input-0').focus();
    await page.keyboard.type(FIXED_OTP_CODE, { delay: 50 });
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // BOTH queued mutations replayed after the single elevation.
    await expect(page.getByTestId('haskey-badge-plutu')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('haskey-badge-tlync')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () =>
        prisma.platformAuditLog.count({
          where: { actorUserId: superAdminId, action: 'STEP_UP_OTP_VERIFIED' },
        })
      )
      .toBe(1);

    const rows = await prisma.integrationConfig.findMany({
      where: { hotelId, engine: { in: ['plutu', 'tlync'] } },
    });
    expect(rows).toHaveLength(2);
  });

  test('delete elevates too: confirm -> 403 -> OTP -> replay -> key row removed', async ({
    page,
  }) => {
    // Seed a configured gateway directly so the card renders with a saved key.
    await prisma.integrationConfig.create({
      data: {
        hotelId,
        engine: 'plutu',
        kind: 'PAYMENT_GATEWAY',
        apiKeyEnc: 'enc-seeded-for-delete-test',
        isActive: true,
        updatedById: superAdminId,
      },
    });

    await loginAndOpenIntegrations(page);
    await expect(page.getByTestId('haskey-badge-plutu')).toBeVisible();

    // Confirm the destructive action…
    await page.getByTestId('btn-delete-plutu').click();
    await expect(page.getByText('حذف التكامل')).toBeVisible();
    await page.getByRole('button', { name: 'حذف نهائي' }).click();

    // …which is sudo-gated: modal -> Prisma code -> replay.
    await completeSudoOtp(page);

    // The row is gone and the card is back to the unconfigured state.
    await expect(page.getByTestId('nokey-badge-plutu')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () =>
        prisma.integrationConfig.count({ where: { hotelId, engine: 'plutu' } })
      )
      .toBe(0);
  });
});