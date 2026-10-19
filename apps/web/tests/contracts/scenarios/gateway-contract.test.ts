import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma, resetDb, seedTestData, closeDb } from '../../helpers/db';
import { createDummyGateway, DummyGatewayServer } from '../dummy-gateway/server';
import {
  CONTRACT_SECRETS,
  buildSignedWebhook,
  plutuSign,
  providerWebhookIdField,
} from '../shared/signer';
import {
  plutuCreateRequestSchema,
  plutuCreateResponseSchema,
  plutuWebhookSchema,
} from '../schemas/plutu.contract.schema';
import {
  tlyncCreateRequestSchema,
  tlyncCreateResponseSchema,
  tlyncWebhookSchema,
} from '../schemas/tlync.contract.schema';
import { POST as paymentSessionPOST } from '@/app/api/public/bookings/[id]/payment-session/route';
import { POST as webhookPOST } from '@/app/api/external/gateways/[provider]/webhook/route';
import { GET as statusGET } from '@/app/api/public/bookings/[id]/payment-session/[sessionId]/status/route';
import { BookingService } from '@/lib/services/booking.service';
import { getGatewayAdapter } from '@/lib/integrations/gateways';

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 30,
    current: 1,
    remaining: 29,
    resetAt: 9999999999,
  }),
}));

let data: Awaited<ReturnType<typeof seedTestData>>;
let booking: any;
let dummy: DummyGatewayServer;
let bookingService = new BookingService();

function loadFixture(provider: 'plutu' | 'tlync', name: string) {
  const filePath = path.resolve(__dirname, `../fixtures/${provider}/v1/${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as {
    meta?: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
}

const FIXTURES = {
  plutu: {
    success: loadFixture('plutu', 'webhook.success'),
    failed: loadFixture('plutu', 'webhook.failed'),
    pending: loadFixture('plutu', 'webhook.pending'),
    createRequest: loadFixture('plutu', 'create.request'),
  },
  tlync: {
    success: loadFixture('tlync', 'webhook.success'),
    failed: loadFixture('tlync', 'webhook.failed'),
    pending: loadFixture('tlync', 'webhook.pending'),
    createRequest: loadFixture('tlync', 'create.request'),
  },
} as const;

beforeAll(async () => {
  dummy = await createDummyGateway();
  await dummy.start();

  vi.stubEnv('DANGER_BYPASS_WEBHOOK_IP_CHECK', 'true');
  vi.stubEnv('PAYMENT_CRYPTO_KEY', 'a'.repeat(64));
  vi.stubEnv('PLUTU_BASE_URL', dummy.baseUrl);
  vi.stubEnv('TLYNC_BASE_URL', dummy.baseUrl);
  for (const provider of ['plutu', 'tlync'] as const) {
    const secrets = CONTRACT_SECRETS[provider];
    const prefix = provider === 'plutu' ? 'PLUTU' : 'TLYNC';
    vi.stubEnv(`${prefix}_MERCHANT_ID`, secrets.merchantId);
    vi.stubEnv(`${prefix}_SECRET_KEY`, secrets.secretKey);
    vi.stubEnv(`${prefix}_MERCHANT_ID_DEV`, secrets.merchantId);
    vi.stubEnv(`${prefix}_SECRET_KEY_DEV`, secrets.secretKey);
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
  dummy.behavior.failCreate = {};
});

afterEach(() => {
  vi.useRealTimers();
  dummy.clearDeliveries();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    await dummy.close();
  } finally {
    await closeDb();
  }
});

async function createSession(gateway: 'plutu' | 'tlync') {
  const res = await paymentSessionPOST(
    new NextRequest(`http://localhost/api/public/bookings/${booking.id}/payment-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway, returnUrl: `https://example.com/payment/return/${gateway}` }),
    }),
    { params: Promise.resolve({ id: booking.id }) },
  );
  expect(res.status).toBe(201);
  return (await res.json()).data as {
    paymentSessionId: string;
    paymentUrl: string;
    gatewayTransactionId: string;
    amount: number;
    currency: string;
  };
}

function capturedCreateRequest(gateway: 'plutu' | 'tlync') {
  const path = gateway === 'plutu' ? '/payment/create' : '/payment/initiate';
  const captured = dummy.requests.find((r) => r.method === 'POST' && r.url === path);
  expect(captured, `dummy gateway must have received a ${gateway} create request`).toBeDefined();
  return captured!.body as Record<string, unknown>;
}

async function deliverSignedWebhook(
  gateway: 'plutu' | 'tlync',
  session: { id: string; merchantTxId: string; gatewayTransactionId: string; amount: number },
  fixturePayload: Record<string, unknown>,
  options: { statusOverride?: string } = {},
) {
  const idField = providerWebhookIdField(gateway);
  const merged = {
    ...fixturePayload,
    [idField]: session.gatewayTransactionId,
    order_id: session.merchantTxId,
    amount: Number(session.amount),
    ...(options.statusOverride ? { status: options.statusOverride } : {}),
  };
  const payload = buildSignedWebhook(gateway, merged, CONTRACT_SECRETS[gateway].secretKey);

  const res = await webhookPOST(
    new NextRequest(`http://localhost/api/external/gateways/${gateway}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ provider: gateway }) },
  );
  return { res, payload };
}

async function checkVerified(sessionId: string) {
  const res = await statusGET(
    new NextRequest(
      `http://localhost/api/public/bookings/${booking.id}/payment-session/${sessionId}/status`,
    ),
    { params: Promise.resolve({ id: booking.id, sessionId }) },
  );
  return (await res.json()).data as { verified: boolean };
}

describe('Contract sandbox: golden fixtures pinned to gateway contracts', () => {
  it('Plutu fixtures: baked signature === recomputed signature, payload parses with app schema', () => {
    for (const key of ['success', 'failed', 'pending'] as const) {
      const { payload } = FIXTURES.plutu[key];
      const { signature, ...unsigned } = payload;
      expect(plutuSign(unsigned, CONTRACT_SECRETS.plutu.secretKey)).toBe(signature);
      expect(plutuWebhookSchema.safeParse(payload).success).toBe(true);
    }
    const createPayload = FIXTURES.plutu.createRequest.payload;
    const { signature, ...unsignedCreate } = createPayload;
    expect(plutuSign(unsignedCreate, CONTRACT_SECRETS.plutu.secretKey)).toBe(signature);
    expect(plutuCreateRequestSchema.safeParse(createPayload).success).toBe(true);
    expect(plutuCreateResponseSchema.safeParse({
      payment_url: 'https://sandbox.plutu.ly/pay/abc',
      session_id: 'sess_abc',
      transaction_id: 'txn_abc',
    }).success).toBe(true);
  });

  it('TLync fixtures: baked signature === recomputed HMAC, payload parses with app schema', () => {
    for (const key of ['success', 'failed', 'pending'] as const) {
      const { payload } = FIXTURES.tlync[key];
      const { signature } = payload;
      expect(buildSignedWebhook('tlync', payload, CONTRACT_SECRETS.tlync.secretKey).signature).toBe(signature);
      expect(tlyncWebhookSchema.safeParse(payload).success).toBe(true);
    }
    expect(tlyncCreateRequestSchema.safeParse(FIXTURES.tlync.createRequest.payload).success).toBe(true);
    expect(tlyncCreateResponseSchema.safeParse({
      payment_url: 'https://sandbox.tlync.ly/pay/abc',
      session_id: 'sess_abc',
      tran_id: 'tran_abc',
    }).success).toBe(true);
  });
});

describe('Plutu wire contract (real adapter → dummy gateway → real webhook)', () => {
  it('creates a session over real HTTP matching the signed contract, then settles via webhook to SUCCEEDED', async () => {
    const created = await createSession('plutu');

    const captured = capturedCreateRequest('plutu');

    const parsed = plutuCreateRequestSchema.safeParse(captured);
    expect(parsed.success, `create request must match contract: ${parsed.success ? '' : JSON.stringify(parsed.error)}`).toBe(true);

    const capturedAt = dummy.requests.find((r) => r.method === 'POST' && r.url === '/payment/create')!;
    const reqHeaders = capturedAt.headers as Record<string, string>;
    expect(reqHeaders['content-type']).toContain('application/json');

    const { signature, ...unsigned } = captured;
    expect(plutuSign(unsigned, CONTRACT_SECRETS.plutu.secretKey)).toBe(signature);

    const responseSchema = plutuCreateResponseSchema.safeParse({
      payment_url: created.paymentUrl,
      session_id: created.gatewayTransactionId,
      transaction_id: created.gatewayTransactionId,
    });
    expect(responseSchema.success).toBe(true);
    expect(created.paymentUrl).toContain('/pay/');

    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();
    expect(session!.status).toBe('PENDING');

    expect((await checkVerified(created.paymentSessionId)).verified).toBe(false);

    const { res } = await deliverSignedWebhook('plutu', session!, FIXTURES.plutu.success.payload);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('succeeded');
    expect(json.data.paymentId).toBeDefined();

    const payment = await prisma.payment.findUnique({ where: { id: json.data.paymentId } });
    expect(payment!.status).toBe('SUCCEEDED');
    expect(payment!.gateway).toBe('plutu');

    const updated = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(updated!.status).toBe('SUCCEEDED');

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio!.balance)).toBe(0);
    expect(folio!.status).toBe('SETTLED');

    expect((await checkVerified(created.paymentSessionId)).verified).toBe(true);
  });

  it('getGatewayAdapter: explicit config override wins over environment — no env mutation needed', async () => {
    const overrideMerchant = 'mer_test_override_0009';
    const adapter = getGatewayAdapter('plutu', {
      config: {
        merchantId: overrideMerchant,
        secretKey: CONTRACT_SECRETS.plutu.secretKey,
      },
    });

    expect(adapter.config.baseUrl).toBe(dummy.baseUrl);

    const result = await adapter.createPaymentSession({
      amount: 120,
      currency: 'LYD',
      orderId: 'ord_override_0001',
      customerName: 'Override Tester',
      customerEmail: 'override@example.ly',
      returnUrl: 'https://example.com/payment/return',
      callbackUrl: 'https://example.com/api/external/gateways/plutu/webhook',
    });
    expect(result.success).toBe(true);

    const captured = capturedCreateRequest('plutu');
    expect(captured.merchant_id).toBe(overrideMerchant);

    const { signature, ...unsigned } = captured;
    expect(plutuSign(unsigned, CONTRACT_SECRETS.plutu.secretKey)).toBe(signature);
  });

  it('rejects a forged signature (tampered payload) with 401 and no ledger change', async () => {
    const created = await createSession('plutu');
    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();

    const merged = {
      ...FIXTURES.plutu.success.payload,
      transaction_id: session!.gatewayTransactionId,
      order_id: session!.merchantTxId,
      amount: Number(session!.amount),
    };
    const legit = buildSignedWebhook('plutu', merged, CONTRACT_SECRETS.plutu.secretKey);
    const forged = { ...legit, signature: `${'0'.repeat(63)}1` };

    const res = await webhookPOST(
      new NextRequest('http://localhost/api/external/gateways/plutu/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forged),
      }),
      { params: Promise.resolve({ provider: 'plutu' }) },
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment).toBeNull();
    const unchanged = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(unchanged!.balance)).toBeGreaterThan(0);
  });

  it('late webhook: guest returns, status stays unverified, then a delayed delivery settles it', async () => {
    const created = await createSession('plutu');
    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();

    let deliveryGateCrossed = false;

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    dummy.scheduleDelivery(3000, async () => {
      deliveryGateCrossed = true;
    });

    expect((await checkVerified(created.paymentSessionId)).verified).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();

    expect(deliveryGateCrossed).toBe(true);

    const { res } = await deliverSignedWebhook('plutu', session!, FIXTURES.plutu.success.payload);
    expect(res.status).toBe(200);

    const settled = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(settled!.status).toBe('SUCCEEDED');
    expect((await checkVerified(created.paymentSessionId)).verified).toBe(true);
  });
});

describe('TLync wire contract (real adapter → dummy gateway → real webhook)', () => {
  it('creates a session over real HTTP with the documented payload, FAILED webhook keeps the ledger untouched', async () => {
    const created = await createSession('tlync');
    const captured = capturedCreateRequest('tlync');

    const parsed = tlyncCreateRequestSchema.safeParse(captured);
    expect(parsed.success, `initiate request must match contract: ${parsed.success ? '' : JSON.stringify(parsed.error)}`).toBe(true);
    expect('signature' in captured).toBe(false);
    expect(typeof captured.amount).toBe('number');

    const capturedAt = dummy.requests.find((r) => r.method === 'POST' && r.url === '/payment/initiate')!;
    const reqHeaders = capturedAt.headers as Record<string, string>;
    expect(reqHeaders['content-type']).toContain('application/json');

    const session = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(session).not.toBeNull();

    const { res } = await deliverSignedWebhook('tlync', session!, FIXTURES.tlync.failed.payload);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('failed');

    const updated = await prisma.paymentSession.findUnique({ where: { id: created.paymentSessionId } });
    expect(updated!.status).toBe('FAILED');

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment).toBeNull();

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio!.balance)).toBeGreaterThan(0);
    expect(folio!.status).toBe('ACTIVE');
    expect((await checkVerified(created.paymentSessionId)).verified).toBe(false);
  });

  it('declined create (gateway-side error) → 502 and no PaymentSession row', async () => {
    dummy.behavior.failCreate = {
      tlync: { status: 400, body: { error_message: 'INVALID_MERCHANT', message: 'Merchant declined by sandbox' } },
    };

    const res = await paymentSessionPOST(
      new NextRequest(`http://localhost/api/public/bookings/${booking.id}/payment-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: 'tlync', returnUrl: 'https://example.com/return/tlync' }),
      }),
      { params: Promise.resolve({ id: booking.id }) },
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);

    const captured = capturedCreateRequest('tlync');
    expect(tlyncCreateRequestSchema.safeParse(captured).success).toBe(true);

    const sessions = await prisma.paymentSession.findMany({ where: { bookingId: booking.id } });
    expect(sessions).toHaveLength(0);
  });
});