import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { createDummyGateway, DummyGatewayServer } from '../contracts/dummy-gateway/server';
import {
  buildSignedWebhook,
  plutuSign,
  providerWebhookIdField,
} from '../contracts/shared/signer';
import { BookingService } from '@/lib/services/booking.service';
import { getGatewayAdapter } from '@/lib/integrations/gateways';
import { resolveGatewayConfig } from '@/lib/integrations/gateways/gateway-config';
import { getProviderDefinition } from '@/lib/integrations/registry';
import { encryptSecret, decryptSecret } from '@/lib/utils/crypto';
import { POST as paymentSessionPOST } from '@/app/api/public/bookings/[id]/payment-session/route';
import { POST as webhookPOST } from '@/app/api/external/gateways/[provider]/webhook/route';

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 30,
    current: 1,
    remaining: 29,
    resetAt: 9999999999,
  }),
}));

// Credentials the superadmin STORES for the test hotel — they differ from the
// env stubs below so every assertion can prove the DB row wins (DB-first).
const DB_SECRETS = {
  plutu: { merchantId: 'mer_db_wiring_0001', secretKey: 'sec_key_db_wiring_aaaa_1' },
  tlync: { merchantId: 'mer_db_wiring_9001', secretKey: 'sec_key_db_wiring_bbbb_9' },
};

// Platform env credentials (what the app would use if no hotel row existed).
const ENV_SECRETS = {
  plutu: { merchantId: 'mer_env_legacy_1111', secretKey: 'sec_key_env_legacy_cccc' },
  tlync: { merchantId: 'mer_env_legacy_2222', secretKey: 'sec_key_env_legacy_dddd' },
};

let data: Awaited<ReturnType<typeof seedTestData>>;
let booking: any;
let dummy: DummyGatewayServer;
let bookingService = new BookingService();

async function storeGatewayConfig(
  provider: 'plutu' | 'tlync',
  secrets: { merchantId: string; secretKey: string },
  options: { active?: boolean; omitSecret?: boolean } = {}
) {
  const def = getProviderDefinition(provider)!;
  const bundle = { merchantId: secrets.merchantId, secretKey: secrets.secretKey };
  return prisma.integrationConfig.create({
    data: {
      hotelId: data.hotel.id,
      engine: provider,
      kind: 'PAYMENT_GATEWAY',
      apiKeyEnc: options.omitSecret ? null : encryptSecret(JSON.stringify(bundle)),
      config: JSON.stringify({
        baseUrl: dummy.baseUrl,
        returnUrl: `https://example.com/return/${provider}`,
        callbackUrl: `https://example.com/api/external/gateways/${provider}/webhook`,
      }),
      isActive: options.active ?? true,
      updatedById: data.admin.id,
    },
  });
}

async function createSession(returnUrl = 'https://example.com/payment/return/wiring') {
  const res = await paymentSessionPOST(
    new NextRequest(`http://localhost/api/public/bookings/${booking.id}/payment-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway: 'plutu', returnUrl }),
    }),
    { params: Promise.resolve({ id: booking.id }) },
  );
  return res;
}

async function deliverPlutuWebhook(
  session: { id: string; merchantTxId: string; gatewayTransactionId: string; amount: number },
  secretKey: string,
  status = 'SUCCESS',
) {
  const base = {
    transaction_id: session.gatewayTransactionId,
    order_id: session.merchantTxId,
    amount: Number(session.amount),
    currency: 'LYD',
    payment_method: 'card',
    status,
  };
  const payload = buildSignedWebhook('plutu', base, secretKey);
  const res = await webhookPOST(
    new NextRequest('http://localhost/api/external/gateways/plutu/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ provider: 'plutu' }) },
  );
  return res;
}

beforeAll(async () => {
  dummy = await createDummyGateway({ secrets: { plutu: DB_SECRETS.plutu, tlync: DB_SECRETS.tlync } });
  await dummy.start();

  vi.stubEnv('DANGER_BYPASS_WEBHOOK_IP_CHECK', 'true');
  vi.stubEnv('PAYMENT_CRYPTO_KEY', 'a'.repeat(64));
  vi.stubEnv('PLUTU_BASE_URL', dummy.baseUrl);
  vi.stubEnv('TLYNC_BASE_URL', dummy.baseUrl);
  for (const provider of ['plutu', 'tlync'] as const) {
    const prefix = provider === 'plutu' ? 'PLUTU' : 'TLYNC';
    vi.stubEnv(`${prefix}_MERCHANT_ID`, ENV_SECRETS[provider].merchantId);
    vi.stubEnv(`${prefix}_SECRET_KEY`, ENV_SECRETS[provider].secretKey);
    vi.stubEnv(`${prefix}_MERCHANT_ID_DEV`, ENV_SECRETS[provider].merchantId);
    vi.stubEnv(`${prefix}_SECRET_KEY_DEV`, ENV_SECRETS[provider].secretKey);
  }
}, 60000);

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
  booking = await bookingService.create({
    hotelId: data.hotel.id,
    guestName: 'ضيف اختبار',
    adults: 1,
    children: 0,
    checkIn: '2026-07-01T14:00:00Z',
    checkOut: '2026-07-03T12:00:00Z',
    source: 'RECEPTION',
    rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
  });
  dummy.clearRequests();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    await dummy.close();
  } finally {
    await closeDb();
  }
});

describe('SA.4.5 Gateway Credential Wiring (IntegrationConfig → adapter → snapshot)', () => {
  it('resolveGatewayConfig: a scoped stored row is authoritative over env', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu);

    const resolution = await resolveGatewayConfig('plutu', { hotelId: data.hotel.id });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.source).toBe('db');
    const config: any = resolution.config;
    expect(config.merchantId).toBe(DB_SECRETS.plutu.merchantId);
    expect(config.secretKey).toBe(DB_SECRETS.plutu.secretKey);
    expect(config.baseUrl).toBe(dummy.baseUrl);
    expect(config.callbackUrl).toBe(`https://example.com/api/external/gateways/plutu/webhook`);
    expect(config.merchantId).not.toBe(ENV_SECRETS.plutu.merchantId);
    expect(config.secretKey).not.toBe(ENV_SECRETS.plutu.secretKey);
  });

  it('resolveGatewayConfig: no row for the hotel → env fallback', async () => {
    const resolution = await resolveGatewayConfig('plutu', { hotelId: data.hotel.id });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.source).toBe('env');
    const config: any = resolution.config;
    expect(config.merchantId).toBe(ENV_SECRETS.plutu.merchantId);
    expect(config.secretKey).toBe(ENV_SECRETS.plutu.secretKey);
  });

  it('resolveGatewayConfig: stored row refuses to fall back when disabled or secretless', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu, { active: false });
    const disabled = await resolveGatewayConfig('plutu', { hotelId: data.hotel.id });
    expect(disabled.ok).toBe(false);
    if (disabled.ok) return;
    expect(disabled.reason).toBe('NOT_CONFIGURED_DISABLED');

    await resetDb();
    data = await seedTestData();
    await storeGatewayConfig('plutu', DB_SECRETS.plutu, { omitSecret: true });
    const secretless = await resolveGatewayConfig('plutu', { hotelId: data.hotel.id });
    expect(secretless.ok).toBe(false);
    if (secretless.ok) return;
    expect(secretless.reason).toBe('INVALID_STORED_SECRET');
  });

  it('resolveGatewayConfig: tlync mirrors the same DB-first behaviour', async () => {
    await storeGatewayConfig('tlync', DB_SECRETS.tlync);

    const resolution = await resolveGatewayConfig('tlync', { hotelId: data.hotel.id });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.source).toBe('db');
    const config: any = resolution.config;
    expect(config.merchantId).toBe(DB_SECRETS.tlync.merchantId);
    expect(config.secretKey).toBe(DB_SECRETS.tlync.secretKey);
  });

  it('adapter with hotelId resolves stored credentials without any explicit config', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu);

    const adapter = getGatewayAdapter('plutu', { hotelId: data.hotel.id });
    const result = await adapter.createPaymentSession({
      amount: 100,
      currency: 'LYD',
      orderId: 'ord_wiring_adapter_0001',
      customerName: 'Adapter Tester',
      customerEmail: 'adapter@example.ly',
      returnUrl: 'https://example.com/return',
      callbackUrl: 'https://example.com/api/external/gateways/plutu/webhook',
    });

    expect(result.success).toBe(true);

    const captured = dummy.requests.find((r) => r.method === 'POST' && r.url === '/payment/create');
    expect(captured).toBeDefined();
    const body = captured!.body as Record<string, any>;
    expect(body.merchant_id).toBe(DB_SECRETS.plutu.merchantId);
    expect(body.merchant_id).not.toBe(ENV_SECRETS.plutu.merchantId);

    const { signature, ...unsigned } = body;
    expect(plutuSign(unsigned, DB_SECRETS.plutu.secretKey)).toBe(signature);
  });

  it('route: stored creds flow into the gateway call and the PaymentSession snapshot', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu);

    const res = await createSession();
    expect(res.status).toBe(201);

    const captured = dummy.requests.find((r) => r.method === 'POST' && r.url === '/payment/create');
    expect(captured).toBeDefined();
    const body = captured!.body as Record<string, any>;
    expect(body.merchant_id).toBe(DB_SECRETS.plutu.merchantId);
    const { signature, ...unsigned } = body;
    expect(plutuSign(unsigned, DB_SECRETS.plutu.secretKey)).toBe(signature);

    const created = (await res.json()).data as { paymentSessionId: string };
    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();
    expect(session!.gatewayConfig).not.toBeNull();

    const snapshot = JSON.parse(decryptSecret(session!.gatewayConfig!));
    expect(snapshot.merchantId).toBe(DB_SECRETS.plutu.merchantId);
    expect(snapshot.secretKey).toBe(DB_SECRETS.plutu.secretKey);
    expect(snapshot.baseUrl).toBe(dummy.baseUrl);
  });

  it('webhook verifies from the snapshot: key rotation mid-session does not break in-flight payment', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu);

    const res = await createSession();
    expect(res.status).toBe(201);
    const created = (await res.json()).data as {
      paymentSessionId: string;
      amount: number;
    };
    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();

    await prisma.integrationConfig.update({
      where: { hotelId_engine: { hotelId: data.hotel.id, engine: 'plutu' } },
      data: {
        apiKeyEnc: encryptSecret(
          JSON.stringify({ merchantId: 'mer_rotated_9999', secretKey: 'sec_key_rotated_zzzz' })
        ),
      },
    });

    const webhookRes = await deliverPlutuWebhook(session!, DB_SECRETS.plutu.secretKey);
    expect(webhookRes.status).toBe(200);
    const json = await webhookRes.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('succeeded');

    const payment = await prisma.payment.findUnique({ where: { id: json.data.paymentId } });
    expect(payment).not.toBeNull();
    expect(payment!.status).toBe('SUCCEEDED');

    const updated = await prisma.paymentSession.findUnique({ where: { id: session!.id } });
    expect(updated!.status).toBe('SUCCEEDED');
  });

  it('route: disabled stored gateway → 400 GATEWAY_CONFIG_UNAVAILABLE, no env leak, no gateway call', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu, { active: false });

    const res = await createSession();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('GATEWAY_CONFIG_UNAVAILABLE');

    expect(dummy.requests.some((r) => r.url === '/payment/create')).toBe(false);
    const sessions = await prisma.paymentSession.findMany({ where: { bookingId: booking.id } });
    expect(sessions).toHaveLength(0);
  });

  it('route: stored gateway with missing secret → 400 GATEWAY_CONFIG_UNAVAILABLE', async () => {
    await storeGatewayConfig('plutu', DB_SECRETS.plutu, { omitSecret: true });

    const res = await createSession();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('GATEWAY_CONFIG_UNAVAILABLE');
  });

  it('No stored row for the hotel → env fallback keeps the legacy pre-SA.4.5 flow (env creds reach the gateway)', async () => {
    // The wiring dummy only trusts the DB-stored key, so an env-signed create
    // is rejected at the gateway (HTTP 401 → route 502). That rejection is
    // exactly the proof we want: WITHOUT a stored row the app called the
    // gateway with ENV credentials — proving the env fallback path was taken.
    const res = await createSession();
    expect(res.status).toBe(502);

    const captured = dummy.requests.find((r) => r.method === 'POST' && r.url === '/payment/create');
    expect(captured).toBeDefined();
    const body = captured!.body as Record<string, any>;
    expect(body.merchant_id).toBe(ENV_SECRETS.plutu.merchantId);
    expect(body.merchant_id).not.toBe(DB_SECRETS.plutu.merchantId);

    const sessions = await prisma.paymentSession.findMany({ where: { bookingId: booking.id } });
    expect(sessions).toHaveLength(0);
  });
});