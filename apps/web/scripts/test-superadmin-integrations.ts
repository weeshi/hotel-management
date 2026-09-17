/**
 * SA.4 integration harness — Super-Admin Integration API backend.
 *
 * Exercises the real HTTP endpoints against a running dev server:
 *   GET/POST/DELETE /api/superadmin/integrations
 *
 * Session bootstrap reuses the deterministic SA.2 flow (patched codeHash).
 * Secrets are checked via DB round-trip (decryptSecret) and verified NEVER to
 * appear in any response body.
 *
 * Usage:  npm run test:superadmin-integrations   (dev server must listen on :3210)
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
const INTEGRATIONS_PATH = '/api/superadmin/integrations';

const KNOWN_CODE = '654321';

const PLUTU_MERCHANT = 'merch_plututest_001';
const PLUTU_SECRET = 'plutu_super_secret_abc123xyz!';
const BOOKING_API_KEY = 'bk_api_hotel_zeta_789';

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

  return { status: res.status, body, setCookies };
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

async function main() {
  const { hashOtpCode } = await import('../src/lib/utils/otp');
  const { verifyOtpChallengeToken } = await import('../src/lib/utils/jwt');
  const { decryptSecret } = await import('../src/lib/utils/crypto');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log(`\n[SA.4] Super-Admin Integrations harness — ${BASE}\n`);

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

  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!hotel) {
    console.error('No hotel found in DB — run npm run db:seed.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Prepared super-admin ${user.id} (${user.email}) + hotel ${hotel.id}\n`);

  // 1. CSRF bootstrap + deterministic 2FA login -> tv session
  const csrf = await call('/api/auth/csrf');
  const csrfToken = cookieFrom(csrf.setCookies, 'csrf-token') || csrf.body?.data?.token;
  check('CSRF bootstrap returns a token', csrf.status === 200 && !!csrfToken, `status=${csrf.status}`);

  const jsonHeaders = { 'content-type': 'application/json' };

  const login = await call(LOGIN_PATH, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const saCookie = cookieFrom(login.setCookies, 'sa_otp');
  const decoded = saCookie ? await verifyOtpChallengeToken(saCookie) : null;
  if (decoded?.challengeId) {
    await prisma.otpChallenge.update({
      where: { id: decoded.challengeId },
      data: { attempts: 0, codeHash: hashOtpCode(user.id, 'SUPER_ADMIN_LOGIN', KNOWN_CODE) },
    });
  }
  const verifyHeaders = { ...jsonHeaders, 'x-csrf-token': csrfToken as string };
  const verifyCookies = `sa_otp=${saCookie}; csrf-token=${csrfToken}`;
  const ok = await call(VERIFY_PATH, {
    method: 'POST',
    headers: verifyHeaders,
    cookie: verifyCookies,
    body: JSON.stringify({ code: KNOWN_CODE }),
  });
  const tvToken: string | undefined = ok.body?.data?.accessToken;
  check('2FA login yields a tv session', ok.status === 200 && !!tvToken, `got ${ok.status}`);

  const authHeaders = { authorization: `Bearer ${tvToken}` };
  const q = `?hotelId=${encodeURIComponent(hotel.id)}`;

  // 2. GET before writes -> 200, array, no secret fields
  const get0 = await call(`${INTEGRATIONS_PATH}${q}`, { headers: authHeaders });
  check('GET lists integrations (empty or existing)', get0.status === 200 && Array.isArray(get0.body?.data), `got ${get0.status}`);
  const body0 = JSON.stringify(get0.body ?? {});
  check('GET response leaks no secret material', !/secretKey|merchantId|apiKey/.test(body0) || !/plutu_|bk_api_/.test(body0));

  // 3. POST payment gateway (plutu) -> sealed JSON bundle, hasKey only in response
  const postH = { ...authHeaders, ...verifyHeaders, cookie: `csrf-token=${csrfToken}` };
  const postPlutu = await call(INTEGRATIONS_PATH, {
    method: 'POST',
    headers: postH,
    body: JSON.stringify({
      hotelId: hotel.id,
      engine: 'plutu',
      secret: { merchantId: PLUTU_MERCHANT, secretKey: PLUTU_SECRET },
      config: { baseUrl: 'https://gateway.plutu.test', isSandbox: true },
      isActive: true,
    }),
  });
  check('POST creates plutu integration (201)', postPlutu.status === 201, `got ${postPlutu.status} ${JSON.stringify(postPlutu.body)}`);
  const plutuRow = postPlutu.body?.data;
  check('POST response kind=PAYMENT_GATEWAY + hasKey=true', plutuRow?.kind === 'PAYMENT_GATEWAY' && plutuRow?.hasKey === true, JSON.stringify(plutuRow));
  const bodyPlutu = JSON.stringify(postPlutu.body ?? {});
  check('POST response contains NO secret parts', !bodyPlutu.includes(PLUTU_SECRET) && !bodyPlutu.includes(PLUTU_MERCHANT), bodyPlutu);

  const dbPlutu = await prisma.integrationConfig.findUnique({
    where: { hotelId_engine: { hotelId: hotel.id, engine: 'plutu' } },
  });
  let plutuBundle: any = null;
  if (dbPlutu?.apiKeyEnc) {
    try {
      plutuBundle = JSON.parse(decryptSecret(dbPlutu.apiKeyEnc));
    } catch {
      plutuBundle = null;
    }
  }
  check(
    'DB row sealed as encrypted JSON bundle {merchantId,secretKey}',
    !!(dbPlutu && plutuBundle && typeof plutuBundle === 'object' && !Array.isArray(plutuBundle) && plutuBundle.merchantId === PLUTU_MERCHANT && plutuBundle.secretKey === PLUTU_SECRET),
    `raw=${JSON.stringify(plutuBundle)}`
  );
  check('DB row kind=PAYMENT_GATEWAY', dbPlutu?.kind === 'PAYMENT_GATEWAY', `kind=${dbPlutu?.kind}`);

  // 4. GET now shows the plutu integration with hasKey=false->true, config non-secret
  const get1 = await call(`${INTEGRATIONS_PATH}${q}&kind=PAYMENT_GATEWAY`, { headers: authHeaders });
  const plutuListed = (get1.body?.data ?? []).find((r: any) => r.engine === 'plutu');
  check('GET filters by kind=PAYMENT_GATEWAY', get1.status === 200 && !!plutuListed, JSON.stringify(get1.body));
  check('Listed plutu exposes config (non-secret only)', !!plutuListed?.config && !JSON.stringify(plutuListed).includes(PLUTU_SECRET));

  // 5. POST booking engine (booking.com) -> legacy RAW encrypted apiKey, kind BOOKING_ENGINE
  const postBooking = await call(INTEGRATIONS_PATH, {
    method: 'POST',
    headers: postH,
    body: JSON.stringify({
      hotelId: hotel.id,
      engine: 'booking.com',
      secret: { apiKey: BOOKING_API_KEY },
      isActive: true,
    }),
  });
  check('POST creates booking.com integration (201)', postBooking.status === 201, `got ${postBooking.status}`);
  check('booking.com kind=BOOKING_ENGINE', postBooking.body?.data?.kind === 'BOOKING_ENGINE', JSON.stringify(postBooking.body?.data));
  const dbBooking = await prisma.integrationConfig.findUnique({
    where: { hotelId_engine: { hotelId: hotel.id, engine: 'booking.com' } },
  });
  let rawKey: string | null = null;
  if (dbBooking?.apiKeyEnc) {
    try {
      rawKey = decryptSecret(dbBooking.apiKeyEnc);
    } catch {
      rawKey = null;
    }
  }
  check('booking.com SOURCE stays a RAW encrypted apiKey (backward compat)', rawKey === BOOKING_API_KEY, `raw=${rawKey}`);

  // 6. GET response never returns the booking apiKey either
  const get2 = await call(`${INTEGRATIONS_PATH}${q}`, { headers: authHeaders });
  check('GET leaks no booking apiKey', !JSON.stringify(get2.body ?? {}).includes(BOOKING_API_KEY));

  // 7. Validation negatives
  const negUnknownEngine = await call(INTEGRATIONS_PATH, {
    method: 'POST',
    headers: postH,
    body: JSON.stringify({ hotelId: hotel.id, engine: 'amadeus', secret: { apiKey: 'x' } }),
  });
  check('POST unknown engine -> 400', negUnknownEngine.status === 400, `got ${negUnknownEngine.status}`);

  const negMissingHotel = await call(INTEGRATIONS_PATH, {
    method: 'POST',
    headers: postH,
    body: JSON.stringify({ engine: 'plutu', secret: { merchantId: 'x', secretKey: 'y' } }),
  });
  check('POST without hotelId -> 422', negMissingHotel.status === 422, `got ${negMissingHotel.status}`);

  const negUnknownHotel = await call(`${INTEGRATIONS_PATH}${q.replace(hotel.id, '00000000-0000-0000-0000-000000000000')}`, {
    headers: authHeaders,
  });
  check('GET unknown hotel -> 404', negUnknownHotel.status === 404, `got ${negUnknownHotel.status}`);

  const negBadSecret = await call(INTEGRATIONS_PATH, {
    method: 'POST',
    headers: postH,
    body: JSON.stringify({ hotelId: hotel.id, engine: 'plutu', secret: { merchantId: 'x' } }),
  });
  check('POST gateway with missing secretKey -> 400', negBadSecret.status === 400, `got ${negBadSecret.status}`);

  const negDeleteUnknown = await call(
    `${INTEGRATIONS_PATH}${q}&engine=custom`,
    { method: 'DELETE', headers: { ...authHeaders, ...verifyHeaders, cookie: `csrf-token=${csrfToken}` } }
  );
  check('DELETE non-existent engine -> 404', negDeleteUnknown.status === 404, `got ${negDeleteUnknown.status}`);

  // 8. tv enforcement: a NON-2FA super-admin token is rejected (403)
  const plainLogin = await call('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const plainToken = plainLogin.body?.data?.accessToken;
  check('Regular login returns a session (non-tv)', !!plainToken, `got ${plainLogin.status}`);
  const noTv = await call(`${INTEGRATIONS_PATH}${q}`, {
    headers: { authorization: `Bearer ${plainToken}` },
  });
  check('GET without tv=true -> 403', noTv.status === 403, `got ${noTv.status} ${JSON.stringify(noTv.body)}`);

  // 9. Unauthenticated -> 401
  const anon = await call(`${INTEGRATIONS_PATH}${q}`);
  check('GET unauthenticated -> 401', anon.status === 401, `got ${anon.status}`);

  // 10. DELETE plutu (permanent removal / key revocation)
  const del = await call(`${INTEGRATIONS_PATH}${q}&engine=plutu`, {
    method: 'DELETE',
    headers: { ...authHeaders, ...verifyHeaders, cookie: `csrf-token=${csrfToken}` },
  });
  check('DELETE plutu -> 200 deleted', del.status === 200 && del.body?.data?.deleted === true, `got ${del.status} ${JSON.stringify(del.body)}`);
  const afterDel = await prisma.integrationConfig.findUnique({
    where: { hotelId_engine: { hotelId: hotel.id, engine: 'plutu' } },
  });
  check('plutu row permanently removed (keys revoked)', !afterDel);

  // 11. Audit rows recorded for create + delete (entity INTEGRATION_CONFIG)
  const audits = await prisma.platformAuditLog.findMany({
    where: { entity: 'INTEGRATION_CONFIG', entityId: { in: [plutuRow?.id ?? '', dbPlutu?.id ?? ''] } },
    orderBy: { createdAt: 'asc' },
  });
  check(
    'PlatformAuditLog has CREATED + DELETED for plutu',
    audits.some((a: any) => a.action === 'INTEGRATION_CREATED') && audits.some((a: any) => a.action === 'INTEGRATION_DELETED'),
    JSON.stringify(audits.map((a: any) => a.action))
  );
  await prisma.platformAuditLog.deleteMany({
    where: { entity: 'INTEGRATION_CONFIG', entityId: { in: [plutuRow?.id ?? '', dbPlutu?.id ?? ''] } },
  });

  // Cleanup — remove created booking.com row, restore seeded account
  await prisma.integrationConfig.deleteMany({ where: { hotelId: hotel.id, engine: { in: ['plutu', 'booking.com'] } } });
  await prisma.user.update({
    where: { id: user.id },
    data: { lockedUntil: null, failedLoginAttempts: 0 },
  });
  await prisma.otpChallenge.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.$disconnect();

  console.log(`\n[SA.4] ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[SA.4] harness crashed:', error);
  process.exitCode = 1;
});