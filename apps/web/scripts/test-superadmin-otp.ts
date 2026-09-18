/**
 * SA.2/SA.2.5/SA.5 integration harness — Super-Admin Email OTP backend + UI
 * guards.
 *
 * Exercises the real HTTP endpoints against a running dev server:
 *   POST /api/superadmin/auth/login
 *   POST /api/superadmin/auth/verify-otp
 *   POST /api/superadmin/auth/resend-otp
 *   POST /api/superadmin/auth/logout            (SA.5)
 * GET  /superadmin, /superadmin/login, /superadmin/otp,
 *      /superadmin/hotels                        (SA.5 server-side page guards)
 *
 * The emailed code is never read; instead the challenge's `codeHash` is patched
 * to a known value (hashOtpCode) so the flow is fully deterministic.
 *
 * Usage:  npm run test:superadmin-otp      (dev server must listen on :3210)
 * Env:    SA_TEST_BASE_URL, SA_TEST_EMAIL, SA_TEST_PASSWORD
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    /* .env is optional — credentials fall back to the dev defaults below */
  }
}
loadDotEnv();

const BASE = process.env.SA_TEST_BASE_URL || 'http://localhost:3210';
const EMAIL = process.env.SA_TEST_EMAIL || 'super@hotel.com';
const PASSWORD = process.env.SA_TEST_PASSWORD || 'superadmin123';

const OTP_PATH = '/api/superadmin/auth';
const LOGIN_PATH = `${OTP_PATH}/login`;
const VERIFY_PATH = `${OTP_PATH}/verify-otp`;
const RESEND_PATH = `${OTP_PATH}/resend-otp`;
const LOGOUT_PATH = `${OTP_PATH}/logout`;

const KNOWN_CODE = '654321';
const WRONG_CODE = '000000';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface CallResult {
  status: number;
  body: any;
  setCookies: string[];
  headers: Headers;
}

interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  cookie?: string;
}

async function call(path: string, options: CallOptions = {}): Promise<CallResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers['cookie'] = options.cookie;

  const res = await fetch(BASE + path, {
    method: options.method,
    body: options.body,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(120000),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [];

  return { status: res.status, body, setCookies, headers: res.headers };
}

function cookieFrom(setCookies: string[], name: string): string | undefined {
  for (const cookie of setCookies) {
    const pair = cookie.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq !== -1 && pair.slice(0, eq).trim() === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}

function rawCookie(setCookies: string[], name: string): string | undefined {
  return setCookies.find((c) => c.startsWith(`${name}=`));
}

async function main() {
  const { hashOtpCode, getOtpResendCooldownSeconds } = await import(
    '../src/lib/utils/otp'
  );
  const { verifyOtpChallengeToken, verifyAccessToken, verifyRefreshToken } = await import(
    '../src/lib/utils/jwt'
  );
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log(`\n[SA.2/SA.5] Super-Admin OTP + page-guard harness — ${BASE}\n`);

  try {
    await call('/api/auth/csrf');
  } catch {
    console.error(`Cannot reach ${BASE}. Start the dev server first (npm run dev).`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.error(`Super-admin ${EMAIL} not found — run npm run db:seed.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.otpChallenge.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: 'SUPER_ADMIN',
      hotelId: null,
      twoFactorEnabled: true,
      twoFactorMethod: 'EMAIL_OTP',
      lockedUntil: null,
      failedLoginAttempts: 0,
    },
  });
  console.log(`Prepared super-admin ${user.id} (${user.email})\n`);

  // 1. CSRF bootstrap
  const csrf = await call('/api/auth/csrf');
  const csrfToken = cookieFrom(csrf.setCookies, 'csrf-token') || csrf.body?.data?.token;
  check(
    'CSRF bootstrap returns a token + cookie',
    csrf.status === 200 && !!csrfToken,
    `status=${csrf.status}`
  );

  const jsonHeaders = { 'content-type': 'application/json' };

  // 2. Wrong password -> uniform 401, no challenge issued
  const badLogin = await call(LOGIN_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: 'definitely-wrong-password' }),
  });
  check('Login with wrong password returns 401', badLogin.status === 401, `got ${badLogin.status}`);

  // 3. Correct password -> OTP challenge, NO session
  const login = await call(LOGIN_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check(
    'Login returns 200 + otpRequired (phase 1)',
    login.status === 200 && login.body?.data?.otpRequired === true,
    `got ${login.status} ${JSON.stringify(login.body)}`
  );
  check(
    'Phase 1 leaks no access/refresh token',
    !login.body?.data?.accessToken && !login.body?.data?.refreshToken
  );
  const saLoginCookie = cookieFrom(login.setCookies, 'sa_otp');
  const saRaw = rawCookie(login.setCookies, 'sa_otp');
  check(
    'sa_otp cookie is set HttpOnly and path-scoped to / (SA.5)',
    !!saRaw &&
      /HttpOnly/i.test(saRaw) &&
      (/Path=\//i.test(saRaw) || /Path=\/?/i.test(saRaw)) &&
      !/api\/superadmin\/auth/i.test(saRaw),
    saRaw
  );
  const decoded = saLoginCookie ? await verifyOtpChallengeToken(saLoginCookie) : null;
  const challengeId = decoded?.challengeId;
  check(
    'sa_otp decodes to a scoped challenge (scope superadmin:otp)',
    decoded?.scope === 'superadmin:otp' && !!challengeId && decoded?.sub === user.id
  );

  // 4. Deterministic wrong code -> 401 + attempts increments, challenge stays live
  if (challengeId) {
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { attempts: 0, codeHash: hashOtpCode(user.id, 'SUPER_ADMIN_LOGIN', KNOWN_CODE) },
    });
  }
  const verifyHeaders = { ...jsonHeaders, 'x-csrf-token': csrfToken as string };
  const verifyCookies = `sa_otp=${saLoginCookie}; csrf-token=${csrfToken}`;

  const wrong = await call(VERIFY_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: verifyCookies,
    body: JSON.stringify({ code: WRONG_CODE }),
  });
  check(
    'Wrong OTP code returns 401',
    wrong.status === 401,
    `got ${wrong.status} ${JSON.stringify(wrong.body)}`
  );
  const afterWrong = challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: challengeId } })
    : null;
  check(
    'Wrong OTP increments attempts to 1 (not consumed)',
    afterWrong?.attempts === 1 && afterWrong?.consumedAt === null,
    `attempts=${afterWrong?.attempts}`
  );

  // ====== 5. SA.2.5 — Resend OTP (/api/superadmin/auth/resend-otp) ======
  let saCookie = saLoginCookie;
  const resendCookies = () => `sa_otp=${saCookie}; csrf-token=${csrfToken}`;
  const cooldownSeconds = getOtpResendCooldownSeconds();
  const beforeHash = afterWrong?.codeHash;

  // The cooldown floor counts the initial login email too (`?? createdAt`), so
  // simulate that the first email is already older than the window.
  if (challengeId) {
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { createdAt: new Date(Date.now() - (cooldownSeconds + 5) * 1000) },
    });
  }

  // 5.1 Fresh challenge (no cooldown yet) -> resend succeeds
  const resend1 = await call(RESEND_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: resendCookies(),
    body: '{}',
  });
  check(
    'Resend OTP returns 200 + masked email + expiresIn',
    resend1.status === 200 &&
      /@/.test(resend1.body?.data?.email ?? '') &&
      resend1.body?.data?.expiresIn > 0,
    `got ${resend1.status} ${JSON.stringify(resend1.body)}`
  );
  const resend1Cookie = cookieFrom(resend1.setCookies, 'sa_otp');
  const decResend1 = resend1Cookie ? await verifyOtpChallengeToken(resend1Cookie) : null;
  check(
    'Resend re-issues the sa_otp challenge cookie (same challenge, scoped)',
    !!resend1Cookie &&
      !!decResend1 &&
      decResend1.scope === 'superadmin:otp' &&
      decResend1.challengeId === challengeId &&
      !!decResend1.exp,
    `len=${resend1Cookie?.length ?? 'none'} exp=${decResend1?.exp}`
  );
  const rowAfterResend1 = challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: challengeId } })
    : null;
  check(
    'Old code invalidated (codeHash changed), attempts reset to 0, lastCodeSentAt set',
    !!rowAfterResend1 &&
      !!beforeHash &&
      rowAfterResend1.codeHash !== beforeHash &&
      rowAfterResend1.attempts === 0 &&
      !!rowAfterResend1.lastCodeSentAt,
    `attempts=${rowAfterResend1?.attempts}`
  );
  check(
    'Resend extends expiresAt (pending session window)',
    !!rowAfterResend1 && !!afterWrong && rowAfterResend1.expiresAt > afterWrong.expiresAt
  );
  if (resend1Cookie) {
    saCookie = resend1Cookie;
  }

  // 5.2 Immediate second resend -> cooldown 429 (anti-email-spamming floor)
  const resend2 = await call(RESEND_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: resendCookies(),
    body: '{}',
  });
  const retryAfter = resend2.headers?.get?.('retry-after');
  const cooldownCode = resend2.body?.error?.code;
  check(
    'Cooldown refuses immediate resend with 429 + Retry-After',
    resend2.status === 429 && cooldownCode === 'COOLDOWN' && (Number(retryAfter) ?? 0) > 0,
    `got ${resend2.status} code=${cooldownCode} retry-after=${retryAfter}`
  );
  const rowAfterResend2 = challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: challengeId } })
    : null;
  check(
    'Cooldown refusal mutates nothing (codeHash/lastCodeSentAt unchanged)',
    !!rowAfterResend2 &&
      !!rowAfterResend1 &&
      rowAfterResend2.codeHash === rowAfterResend1.codeHash &&
      rowAfterResend2.lastCodeSentAt?.getTime() === rowAfterResend1.lastCodeSentAt?.getTime()
  );

  // 5.3 Cooldown elapsed (simulated by back-dating lastCodeSentAt) -> 200 again
  if (challengeId) {
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: {
        lastCodeSentAt: new Date(Date.now() - (cooldownSeconds + 5) * 1000),
      },
    });
  }
  const resend3 = await call(RESEND_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: resendCookies(),
    body: '{}',
  });
  const resend3Cookie = cookieFrom(resend3.setCookies, 'sa_otp');
  check(
    'Resend allowed again after the cooldown window',
    resend3.status === 200 && !!resend3Cookie,
    `got ${resend3.status}`
  );
  if (resend3Cookie) {
    saCookie = resend3Cookie;
  }

  // 5.4 No challenge cookie -> refused before any work (CSRF cookie still sent)
  const noCookie = await call(RESEND_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: `csrf-token=${csrfToken}`,
    body: '{}',
  });
  check(
    'Resend without sa_otp cookie returns 401 CHALLENGE_MISSING',
    noCookie.status === 401 && noCookie.body?.error?.code === 'CHALLENGE_MISSING',
    `got ${noCookie.status}`
  );

  // 5.5 Tampered / expired challenge cookie -> refused + cookie cleared
  const tampered = await call(RESEND_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: `sa_otp=evil.invalid.token; csrf-token=${csrfToken}`,
    body: '{}',
  });
  check(
    'Tampered challenge cookie returns 401 CHALLENGE_INVALID + clearing set-cookie',
    tampered.status === 401 &&
      tampered.body?.error?.code === 'CHALLENGE_INVALID' &&
      /max-age=0/i.test(rawCookie(tampered.setCookies, 'sa_otp') ?? ''),
    `got ${tampered.status} ${JSON.stringify(tampered.setCookies)}`
  );

  // 5.6 Platform audit recorded both outcomes
  const resendAudits = await prisma.platformAuditLog.findMany({
    where: { entityId: challengeId, action: { in: ['SUPER_ADMIN_OTP_RESENT', 'SUPER_ADMIN_OTP_RESEND_FAILED_COOLDOWN'] } },
    orderBy: { createdAt: 'asc' },
  });
  check(
    'Resend success + cooldown refusal were both audit-logged',
    resendAudits.some((a) => a.action === 'SUPER_ADMIN_OTP_RESENT') &&
      resendAudits.some((a) => a.action === 'SUPER_ADMIN_OTP_RESEND_FAILED_COOLDOWN'),
    `actions=${resendAudits.map((a) => a.action).join(',')}`
  );

  // Re-anchor: patch the live (post-resend) challenge back to the known code so
  // the verify section below stays deterministic.
  if (challengeId) {
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { codeHash: hashOtpCode(user.id, 'SUPER_ADMIN_LOGIN', KNOWN_CODE), attempts: 0 },
    });
  }

  // ====== 5.5 SA.5 — server-side page guards (no client "am I allowed?" probe) ======
  const pageNoCookie = await call('/superadmin/otp', { method: 'GET' });
  check(
    '/superadmin/otp without sa_otp cookie redirects to /superadmin/login (307)',
    pageNoCookie.status === 307 &&
      /\/superadmin\/login/.test(pageNoCookie.headers.get('location') ?? ''),
    `got ${pageNoCookie.status} ${pageNoCookie.headers.get('location')}`
  );
  const pageTampered = await call('/superadmin/otp', {
    method: 'GET',
    cookie: 'sa_otp=evil.invalid.token',
  });
  check(
    '/superadmin/otp with tampered cookie redirects to /superadmin/login (307)',
    pageTampered.status === 307 &&
      /\/superadmin\/login/.test(pageTampered.headers.get('location') ?? ''),
    `got ${pageTampered.status}`
  );
  const pageLive = await call('/superadmin/otp', {
    method: 'GET',
    cookie: `sa_otp=${saCookie}`,
  });
  check(
    '/superadmin/otp with a LIVE challenge renders the OTP form (200 HTML)',
    pageLive.status === 200,
    `got ${pageLive.status}`
  );

  // 5. Correct code -> real session with tv=true
  const ok = await call(VERIFY_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: verifyCookies,
    body: JSON.stringify({ code: KNOWN_CODE }),
  });
  check(
    'Correct OTP returns 200 with token pair',
    ok.status === 200 && !!ok.body?.data?.accessToken && !!ok.body?.data?.refreshToken,
    `got ${ok.status} ${JSON.stringify(ok.body)}`
  );
  check('accessToken cookie is set', !!cookieFrom(ok.setCookies, 'accessToken'));
  check('refreshToken cookie is set', !!cookieFrom(ok.setCookies, 'refreshToken'));
  check(
    'sa_otp cookie is cleared after success',
    cookieFrom(ok.setCookies, 'sa_otp') === '',
    rawCookie(ok.setCookies, 'sa_otp')
  );

  if (ok.body?.data?.accessToken) {
    const at: any = await verifyAccessToken(ok.body.data.accessToken);
    check('Access token carries tv=true', at.tv === true, `tv=${at.tv}`);
    check('Access token role is SUPER_ADMIN', at.role === 'SUPER_ADMIN');
    const rt: any = await verifyRefreshToken(ok.body.data.refreshToken);
    check('Refresh token preserves tv=true', rt.tv === true, `tv=${rt.tv}`);
  } else {
    check('Access token carries tv=true', false, 'no token');
    check('Access token role is SUPER_ADMIN', false, 'no token');
    check('Refresh token preserves tv=true', false, 'no token');
  }

  const afterOk = challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: challengeId } })
    : null;
  const userAfterOk = await prisma.user.findUnique({ where: { id: user.id } });
  check(
    'Challenge consumed + lastTwoFactorAt recorded',
    !!afterOk?.consumedAt && !!userAfterOk?.lastTwoFactorAt
  );

  // ====== 5.6 SA.5 — protected pages with a real 2FA session ======
  const atCookie = cookieFrom(ok.setCookies, 'accessToken');
  const rtCookie = cookieFrom(ok.setCookies, 'refreshToken');

  const dashNoToken = await call('/superadmin', { method: 'GET' });
  check(
    '/superadmin without accessToken redirects to /superadmin/login (307)',
    dashNoToken.status === 307 &&
      /\/superadmin\/login/.test(dashNoToken.headers.get('location') ?? ''),
    `got ${dashNoToken.status}`
  );
  const dashLive = await call('/superadmin', {
    method: 'GET',
    cookie: `accessToken=${atCookie}`,
  });
  check(
    '/superadmin with verified session renders the shell (200 HTML)',
    dashLive.status === 200,
    `got ${dashLive.status}`
  );
  const hotelsLive = await call('/superadmin/hotels', {
    method: 'GET',
    cookie: `accessToken=${atCookie}`,
  });
  check(
    '/superadmin/hotels with verified session renders the page (200 HTML)',
    hotelsLive.status === 200,
    `got ${hotelsLive.status}`
  );
  const loginPage = await call('/superadmin/login', { method: 'GET' });
  check(
    '/superadmin/login stays public and renders (200 HTML)',
    loginPage.status === 200,
    `got ${loginPage.status}`
  );
  // A fully-verified session browsing the login screen is bounced forward.
  const loginAuto = await call('/superadmin/login', {
    method: 'GET',
    cookie: `accessToken=${atCookie}`,
  });
  check(
    '/superadmin/login auto-forwarded to /superadmin for verified sessions',
    loginAuto.status === 307 &&
      /\/superadmin$/.test(loginAuto.headers.get('location') ?? ''),
    `got ${loginAuto.status} ${loginAuto.headers.get('location')}`
  );

  // ====== 5.7 SA.5 — logout endpoint (POST /api/superadmin/auth/logout) ======
  const logoutCookies = `accessToken=${atCookie}; refreshToken=${rtCookie}`;
  const logoutNoCsrf = await call(LOGOUT_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    cookie: logoutCookies,
    body: '{}',
  });
  check(
    'Logout without CSRF returns 403',
    logoutNoCsrf.status === 403,
    `got ${logoutNoCsrf.status}`
  );
  const logoutOk = await call(LOGOUT_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: `${logoutCookies}; csrf-token=${csrfToken}`,
    body: '{}',
  });
  check(
    'Logout revokes the session (200 + revoked)',
    logoutOk.status === 200 && logoutOk.body?.data?.revoked === true,
    `got ${logoutOk.status} ${JSON.stringify(logoutOk.body)}`
  );
  const afterLogout = await prisma.refreshToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  check(
    'Refresh tokens for the logout family are revoked in the DB',
    afterLogout.every((r) => r.revoked === true) && afterLogout.length > 0,
    `rows=${afterLogout.length}`
  );
  const refreshAfterLogout = await call('/api/auth/refresh', {
    method: 'POST',
    cookie: `refreshToken=${rtCookie}`,
    body: '{}',
  });
  check(
    'Rotating the revoked refresh token after logout returns 401',
    refreshAfterLogout.status === 401,
    `got ${refreshAfterLogout.status}`
  );

  // 6. Exhausting the attempt cap locks the account
  const login2 = await call(LOGIN_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const sa2 = cookieFrom(login2.setCookies, 'sa_otp');
  const decoded2 = sa2 ? await verifyOtpChallengeToken(sa2) : null;
  if (decoded2?.challengeId) {
    await prisma.otpChallenge.update({
      where: { id: decoded2.challengeId },
      data: { codeHash: hashOtpCode(user.id, 'SUPER_ADMIN_LOGIN', KNOWN_CODE) },
    });
  }
  const verifyCookies2 = `sa_otp=${sa2}; csrf-token=${csrfToken}`;
  let lastExhaustStatus = 0;
  for (let i = 1; i <= 5; i++) {
    const r = await call(VERIFY_PATH, {
      method: 'POST',
      headers: verifyHeaders,
      cookie: verifyCookies2,
      body: JSON.stringify({ code: String(700000 + i) }),
    });
    lastExhaustStatus = r.status;
  }
  check('Exhausting 5 attempts returns 423', lastExhaustStatus === 423, `last=${lastExhaustStatus}`);

  const lockedUser = await prisma.user.findUnique({ where: { id: user.id } });
  check(
    'Account is locked after exhaustion',
    !!lockedUser?.lockedUntil && lockedUser.lockedUntil.getTime() > Date.now()
  );
  const dec2Row = decoded2?.challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: decoded2.challengeId } })
    : null;
  check('Exhausted challenge is consumed', !!dec2Row?.consumedAt);

  // 7. A locked account cannot even pass factor 1
  const lockedLogin = await call(LOGIN_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check('Locked account is refused at login (401)', lockedLogin.status === 401, `got ${lockedLogin.status}`);

  // Cleanup — leave the seeded account usable
  await prisma.user.update({
    where: { id: user.id },
    data: { lockedUntil: null, failedLoginAttempts: 0 },
  });
  await prisma.otpChallenge.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.$disconnect();

  console.log(`\n[SA.2/SA.5] ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[SA.2/SA.5] harness crashed:', error);
  process.exitCode = 1;
});
