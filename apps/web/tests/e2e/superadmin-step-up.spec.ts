/**
 * E2E.1.6 — Super-Admin Step-up Authentication / Sudo Mode (Playwright).
 *
 * Backend-only feature (docs/SUPER-ADMIN-ARCH.md §SA.6): DISTINCT from the
 * login 2FA. After a verified session the Admin must RE-prove identity (an
 * emailed step-up OTP) to touch `/integrations` POST/DELETE — the minted
 * `su_token` (stateless, scoped, 5-minute window-use) is checked by
 * `withSudoMode`, NOT by the identity layer.
 *
 * Same InfoSec architecture as E2E.1.5 (docs/E2E-TESTING-ARCH.md): ZERO
 * production code added for tests. The emailed code is never read — Playwright
 * Prisma-Injects the live `SUPER_ADMIN_STEP_UP` challenge `codeHash`, and
 * forgeries are minted in Node against the real (or wrong) signing secret.
 */

import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createE2eClient } from './setup/db';
import { resetRateLimitKeys } from './setup/rate-limit';
import { hashOtpCode } from '../../src/lib/utils/otp';
import {
  getSudoTokenSecret,
  verifySudoToken,
} from '../../src/lib/utils/jwt';

// Mirror the backend harness + E2E.1.5: load `.env` so the HMAC secret and the
// sudo-token dev fallback we compute here match the `next start` server.
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
const FIXED_OTP_CODE = '246810';
const WRONG_OTP_CODE = '654321';
const LOGIN_PURPOSE = 'SUPER_ADMIN_LOGIN';
const STEP_UP_PURPOSE = 'SUPER_ADMIN_STEP_UP';
const SUDO_WINDOW_SECONDS = 300;

let prisma: PrismaClient;
let superAdminId = '';
let superAdminPasswordHash = '';
let hotelId = '';

test.beforeAll(async () => {
  prisma = createE2eClient();
  superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  // A concrete hotel is required by /integrations — create the bridge row once.
  let hotel = await prisma.hotel.findFirst({ where: { name: 'SA.6 E2E Hotel' } });
  if (!hotel) hotel = await prisma.hotel.create({ data: { name: 'SA.6 E2E Hotel' } });
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

  await resetRateLimitKeys();

  await prisma.otpChallenge.deleteMany({ where: { userId: superAdminId } });
  await prisma.refreshToken.deleteMany({ where: { userId: superAdminId } });
  await prisma.integrationConfig.deleteMany({ where: { hotelId } });
});

// ─── helpers (mirrors superadmin-auth.spec.ts) ─────────────────────────────

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
  await page.keyboard.type(code, { delay: 40 });
}

/**
 * Secret-sauce test plumbing for the E2E HTTP client (NOT a production change):
 * the built server (`next start`) sets every session cookie with
 * `Secure: NODE_ENV === 'production'`. Chromium still SENDS those cookies to
 * plain `http://127.0.0.1` (trusted origin), so the browser UI authenticates
 * fine — but Playwright's Node-side `page.request` is an RFC-6265 HTTP client,
 * NOT the browser: it never sends a `Secure` cookie over plain http, so
 * `withPlatformAuth`/`withCsrf` see nothing and bounce every API call with
 * 401/403. `page.request` reads its cookie jar LIVE from the browser context,
 * so re-minting the logged-in session cookie set WITHOUT the `Secure` flag via
 * `context.addCookies` (same name/domain/path, replacing the server's copy)
 * lets the API calls carry the exact same session a browser tab would.
 */
async function demoteSessionCookies(context: BrowserContext) {
  const sessionCookieNames = new Set(['accessToken', 'refreshToken', 'csrf-token']);
  const demoted = (await context.cookies())
    .filter((c) => sessionCookieNames.has(c.name))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
      expires: c.expires,
      secure: false,
    }));
  await context.addCookies(demoted);
}

/** Walks the full 2FA login and returns a CSRF token for the shared jar. */
async function loginAndBootCsrf(page: Page): Promise<string> {
  await submitLogin(page);
  await patchLoginChallenge(FIXED_OTP_CODE);
  await typeOtpCode(page, FIXED_OTP_CODE);
  await expect(page).toHaveURL(/\/superadmin\/?$/);
  await expect(page.getByTestId('superadmin-welcome')).toBeVisible();

  const csrfRes = await page.request.get('/api/auth/csrf');
  expect(csrfRes.ok()).toBeTruthy();
  const csrfBody = (await csrfRes.json()) as { data?: { token?: string } };
  expect(csrfBody.data?.token).toBeTruthy();
  // After the CSRF bootstrap so the just-set Secure `csrf-token` is demoted too.
  await demoteSessionCookies(page.context());
  return csrfBody.data!.token!;
}

/** Requests a step-up OTP and returns the id + row of the live challenge. */
async function requestStepUp(page: Page, csrfToken: string) {
  const res = await page.request.post('/api/superadmin/auth/step-up/request', {
    headers: { 'x-csrf-token': csrfToken },
  });
  const body = (await res.json()) as any;
  if (res.status() !== 200) throw new Error(`step-up/request failed: ${JSON.stringify(body)}`);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId: superAdminId, purpose: STEP_UP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  expect(challenge, 'step-up/request must mint a SUPER_ADMIN_STEP_UP challenge').toBeTruthy();
  return { challengeId: challenge!.id, challenge: challenge!, body };
}

// ─── E2E.1.6 scenarios ─────────────────────────────────────────────────────

test.describe('Super Admin Sudo Mode (E2E.1.6)', () => {
  test('full Sudo Mode loop: guard blocks, step-up OTP, su_token, window-use', async ({
    page,
  }) => {
    const csrfToken = await loginAndBootCsrf(page);

    // Read-only /integrations stays OUTSIDE sudo mode.
    const getRes = await page.request.get(
      `/api/superadmin/integrations?hotelId=${hotelId}`
    );
    expect(getRes.status()).toBe(200);

    // A mutating call without sudo is refused with a distinct error code.
    const postNoSudo = await page.request.post(
      `/api/superadmin/integrations?hotelId=${hotelId}`,
      {
        headers: { 'x-csrf-token': csrfToken },
        data: { hotelId, engine: 'plutu', isActive: true },
      }
    );
    const postNoSudoBody = (await postNoSudo.json()) as any;
    expect(postNoSudo.status()).toBe(403);
    expect(postNoSudoBody.error?.code).toBe('STEP_UP_REQUIRED');

    // ── wrong code first: 401 + registered attempt ──
    const { challengeId, challenge } = await requestStepUp(page, csrfToken);
    expect(challenge.purpose).toBe(STEP_UP_PURPOSE);
    expect(challenge.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      (SUDO_WINDOW_SECONDS + 5) * 1000
    );

    const wrongRes = await page.request.post(
      '/api/superadmin/auth/step-up/verify',
      { headers: { 'x-csrf-token': csrfToken }, data: { code: WRONG_OTP_CODE } }
    );
    const wrongBody = (await wrongRes.json()) as any;
    expect(wrongRes.status()).toBe(401);
    expect(wrongBody.error?.code).toBe('INVALID');
    await expect
      .poll(async () =>
        (await prisma.otpChallenge.findUnique({ where: { id: challengeId } }))?.attempts
      )
      .toBe(1);

    // ── Prisma Injection: patch the STEP_UP challenge to a known code ──
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: {
        codeHash: hashOtpCode(superAdminId, STEP_UP_PURPOSE, FIXED_OTP_CODE),
        attempts: 0,
        expiresAt: new Date(Date.now() - 5_000), // force a 410 on the re-verify below
      },
    });

    // ── Prisma Time Injection: an EXPIRED code returns 410 ──
    const expiredRes = await page.request.post(
      '/api/superadmin/auth/step-up/verify',
      { headers: { 'x-csrf-token': csrfToken }, data: { code: FIXED_OTP_CODE } }
    );
    const expiredBody = (await expiredRes.json()) as any;
    expect(expiredRes.status()).toBe(410);
    expect(expiredBody.error?.code).toBe('EXPIRED');

    // ── fresh challenge, correct code ──
    const second = await requestStepUp(page, csrfToken);
    await prisma.otpChallenge.update({
      where: { id: second.challengeId },
      data: {
        codeHash: hashOtpCode(superAdminId, STEP_UP_PURPOSE, FIXED_OTP_CODE),
        attempts: 0,
      },
    });
    const okRes = await page.request.post('/api/superadmin/auth/step-up/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: { code: FIXED_OTP_CODE },
    });
    const okBody = (await okRes.json()) as any;
    expect(okRes.status()).toBe(200);
    const sudoToken = okBody.data?.sudoToken as string;
    expect(sudoToken).toBeTruthy();

    const claims = await verifySudoToken(sudoToken);
    expect(claims.scope).toBe('superadmin:integrations');
    expect(claims.purpose).toBe(STEP_UP_PURPOSE);
    expect(claims.sub).toBe(superAdminId);
    expect(claims.jti).toBeTruthy();
    expect((claims.exp ?? 0) * 1000 - Date.now()).toBeLessThanOrEqual(
      (SUDO_WINDOW_SECONDS + 5) * 1000
    );

    // The OTP itself is single-use: a second verify with the SAME code finds
    // no live challenge -> INVALID_CHALLENGE.
    const reuse = await page.request.post('/api/superadmin/auth/step-up/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: { code: FIXED_OTP_CODE },
    });
    expect(reuse.status()).toBe(401);

    // ── Sudo Mode active: POST then window-use second POST then DELETE ──
    const sudoHeaders: Record<string, string> = {
      'x-csrf-token': csrfToken,
      'x-sudo-token': sudoToken,
    };
    const post1 = await page.request.post(
      `/api/superadmin/integrations?hotelId=${hotelId}`,
      {
        headers: sudoHeaders,
        data: { hotelId, engine: 'plutu', isActive: true },
      }
    );
    expect(post1.status()).toBe(201);

    // WINDOW-USE: the SAME token works again (3 gateways in one session, no re-OTP).
    const post2 = await page.request.post(
      `/api/superadmin/integrations?hotelId=${hotelId}`,
      {
        headers: sudoHeaders,
        data: { hotelId, engine: 'plutu', isActive: false },
      }
    );
    expect(post2.status()).toBe(200);

    const delNoSudo = await page.request.delete(
      `/api/superadmin/integrations?hotelId=${hotelId}&engine=plutu`,
      { headers: { 'x-csrf-token': csrfToken } }
    );
    expect(delNoSudo.status()).toBe(403);

    const delSudo = await page.request.delete(
      `/api/superadmin/integrations?hotelId=${hotelId}&engine=plutu`,
      { headers: sudoHeaders }
    );
    expect(delSudo.status()).toBe(200);

    const remaining = await prisma.integrationConfig.count({
      where: { hotelId, engine: 'plutu' },
    });
    expect(remaining).toBe(0);

    // ── Audit ledger recorded the whole lifecycle ──
    const audited = await prisma.platformAuditLog.findMany({
      where: {
        actorUserId: superAdminId,
        action: {
          in: [
            'STEP_UP_OTP_REQUESTED',
            'STEP_UP_OTP_VERIFIED',
            'STEP_UP_OTP_FAILED_INVALID',
            'STEP_UP_OTP_FAILED_EXPIRED',
            'STEP_UP_USED',
            'INTEGRATION_CREATED',
            'INTEGRATION_UPDATED',
            'INTEGRATION_DELETED',
          ],
        },
      },
    });
    const actions = new Set(audited.map((a) => a.action));
    expect(actions).toContain('STEP_UP_OTP_REQUESTED');
    expect(actions).toContain('STEP_UP_OTP_VERIFIED');
    expect(actions).toContain('STEP_UP_OTP_FAILED_INVALID');
    expect(actions).toContain('STEP_UP_OTP_FAILED_EXPIRED');
    expect(actions).toContain('STEP_UP_USED');
    expect(actions).toContain('INTEGRATION_CREATED');
    expect(actions).toContain('INTEGRATION_UPDATED');
    expect(actions).toContain('INTEGRATION_DELETED');
  });

  test('su_token forgery attacks are all rejected (sig, exp, scope, sub)', async ({
    page,
  }) => {
    const csrfToken = await loginAndBootCsrf(page);

    // No valid token is ever obtained in this test — every request carries a
    // hand-minted forgery. Baseline the rejected-audit count to prove only
    // signature/expiry failures (NOT scope/sub mismatches) touch the ledger.
    const baseline = await prisma.platformAuditLog.count({
      where: { action: 'STEP_UP_EXPIRED_REJECTED', actorUserId: superAdminId },
    });

    const secret = getSudoTokenSecret();
    const encoder = new TextEncoder();
    const expSoon = Math.floor(Date.now() / 1000) + SUDO_WINDOW_SECONDS;
    const attempt = async (extra: { secret: string; claims: Record<string, string>; sub: string; exp: number }) => {
      return new SignJWT(extra.claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(extra.sub)
        .setIssuedAt()
        .setExpirationTime(extra.exp)
        .sign(encoder.encode(extra.secret));
    };

    const post = (token: string) =>
      page.request.post(`/api/superadmin/integrations?hotelId=${hotelId}`, {
        headers: { 'x-csrf-token': csrfToken, 'x-sudo-token': token },
        data: { hotelId, engine: 'plutu', isActive: true },
      });

    // 1) WRONG SIGNING SECRET -> 403 STEP_UP_EXPIRED (+1 rejected audit)
    const wrongSecret = await attempt({
      secret: 'wrong-secret-min-32-chars-long-not-the-real!!',
      claims: { scope: 'superadmin:integrations', purpose: STEP_UP_PURPOSE },
      sub: superAdminId,
      exp: expSoon,
    });
    const r1 = await post(wrongSecret);
    expect(r1.status()).toBe(403);
    expect(((await r1.json()) as any).error?.code).toBe('STEP_UP_EXPIRED');

    // 2) EXPIRED but REAL secret (exp in the past) -> 403 STEP_UP_EXPIRED
    const expired = await attempt({
      secret,
      claims: { scope: 'superadmin:integrations', purpose: STEP_UP_PURPOSE },
      sub: superAdminId,
      exp: Math.floor(Date.now() / 1000) - 30,
    });
    const r2 = await post(expired);
    expect(r2.status()).toBe(403);
    expect(((await r2.json()) as any).error?.code).toBe('STEP_UP_EXPIRED');

    await expect
      .poll(async () =>
        prisma.platformAuditLog.count({
          where: { action: 'STEP_UP_EXPIRED_REJECTED', actorUserId: superAdminId },
        })
      )
      .toBe(baseline + 2);

    // 3) Real secret, valid timing, WRONG SCOPE -> 403 STEP_UP_REQUIRED
    const wrongScope = await attempt({
      secret,
      claims: { scope: 'superadmin:something-else', purpose: STEP_UP_PURPOSE },
      sub: superAdminId,
      exp: expSoon,
    });
    const r3 = await post(wrongScope);
    expect(r3.status()).toBe(403);
    expect(((await r3.json()) as any).error?.code).toBe('STEP_UP_REQUIRED');

    // 4) Real secret, valid timing + scope, DIFFERENT subject -> STEP_UP_REQUIRED
    const wrongSub = await attempt({
      secret,
      claims: { scope: 'superadmin:integrations', purpose: STEP_UP_PURPOSE },
      sub: '00000000-0000-0000-0000-0000000000ff',
      exp: expSoon,
    });
    const r4 = await post(wrongSub);
    expect(r4.status()).toBe(403);
    expect(((await r4.json()) as any).error?.code).toBe('STEP_UP_REQUIRED');

    // Scope/sub mismatches must NOT add rejected-audit noise.
    const after = await prisma.platformAuditLog.count({
      where: { action: 'STEP_UP_EXPIRED_REJECTED', actorUserId: superAdminId },
    });
    expect(after).toBe(baseline + 2);

    // Nothing leaked into the config table from forged elevation.
    const created = await prisma.integrationConfig.count({ where: { hotelId } });
    expect(created).toBe(0);
  });
});