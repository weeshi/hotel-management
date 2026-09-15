import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { prisma } from '@/lib/utils/prisma';

process.env.DANGER_BYPASS_WEBHOOK_IP_CHECK = 'true';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_test';

const mockPlutuAdapter = {
  providerName: 'plutu',
  config: { secretKey: 'test-plutu-secret' },
  createPaymentSession: vi.fn().mockResolvedValue({
    success: true,
    paymentUrl: 'https://mock.plutu/pay/sess_test',
    sessionId: 'sess_test_123',
    transactionId: 'txn_test_123',
  }),
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  parseWebhook: vi.fn().mockImplementation((body: string) => ({
    ok: true,
    data: JSON.parse(body),
  })),
};

const mockTLyncAdapter = {
  providerName: 'tlync',
  config: { secretKey: 'test-tlync-secret' },
  createPaymentSession: vi.fn().mockResolvedValue({
    success: true,
    paymentUrl: 'https://mock.tlync/pay/sess_test',
    sessionId: 'sess_tlync_456',
    transactionId: 'txn_tlync_456',
  }),
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  parseWebhook: vi.fn().mockImplementation((body: string) => ({
    ok: true,
    data: JSON.parse(body),
  })),
};

vi.mock('@/lib/integrations/gateways', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGatewayAdapter: vi.fn((provider: string) => {
      if (provider === 'plutu') return mockPlutuAdapter;
      if (provider === 'tlync') return mockTLyncAdapter;
      throw new Error(`Unsupported gateway: ${provider}`);
    }),
    isGatewaySupported: vi.fn((provider: string) => ['plutu', 'tlync'].includes(provider)),
  };
});

describe('Gateway Webhook Integration Tests', () => {
  beforeAll(() => {
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS hotel_test WITH (FORCE);"`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe" -U postgres -h localhost hotel_test`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
    process.env.DATABASE_URL = TEST_DB_URL;
    delete (globalThis as any).prisma;
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS hotel_test WITH (FORCE);"`,
      { env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: 'pipe' },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlutuAdapter.verifyWebhookSignature.mockReturnValue(true);
    mockTLyncAdapter.verifyWebhookSignature.mockReturnValue(true);
    mockPlutuAdapter.parseWebhook.mockImplementation((body: string) => ({
      ok: true,
      data: JSON.parse(body),
    }));
    mockTLyncAdapter.parseWebhook.mockImplementation((body: string) => ({
      ok: true,
      data: JSON.parse(body),
    }));
  });

  async function seedBookingWithBalance(hotelId: string, amount = 500) {
    const guest = await prisma.guest.create({
      data: { name: 'Test Guest', email: 'test@webhook.com', phone: '+218910000000', hotelId },
    });
    const roomType = await prisma.roomType.create({
      data: { hotelId, name: 'Standard', baseRate: 200, capacity: 2 },
    });
    const room = await prisma.room.create({
      data: { hotelId, roomNumber: 'WH-101', roomTypeId: roomType.id, status: 'AVAILABLE' },
    });
    const booking = await prisma.booking.create({
      data: {
        bookingNo: `BK-WH-${Date.now()}`,
        hotelId,
        guestId: guest.id,
        guestName: guest.name,
        adults: 1,
        children: 0,
        status: 'CHECKED_IN',
        rooms: {
          create: {
            roomId: room.id,
            nightlyRate: 200,
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 2 * 86400000),
          },
        },
      },
    });
    const folio = await prisma.folio.create({
      data: { bookingId: booking.id, totalCharges: amount, totalPaid: 0, balance: amount },
    });
    return { booking, folio, guest };
  }

  function buildPlutuWebhook(overrides: Partial<any> = {}) {
    return {
      transaction_id: `txn_${Date.now()}`,
      order_id: `ord_${Date.now()}`,
      amount: 500,
      currency: 'LYD',
      status: 'SUCCESS',
      payment_method: 'card',
      signature: 'valid_signature_placeholder',
      ...overrides,
    };
  }

  function buildTLyncWebhook(overrides: Partial<any> = {}) {
    return {
      tran_id: `txn_${Date.now()}`,
      order_id: `ord_${Date.now()}`,
      amount: 500,
      currency: 'LYD',
      status: 'SUCCESS',
      payment_method: 'card',
      signature: 'valid_signature_placeholder',
      ...overrides,
    };
  }

  async function postWebhook(provider: 'plutu' | 'tlync', payload: any, hotelId: string) {
    const { POST } = await import('@/app/api/external/gateways/[provider]/webhook/route');
    const request = new Request(`http://localhost/api/external/gateways/${provider}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const params = Promise.resolve({ provider });
    return POST(request, { params });
  }

  it('Plutu webhook SUCCESS → creates Payment, updates PaymentSession, applies to Folio, sets SETTLED', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'Webhook Test Hotel', currency: 'LYD' } });
    const { booking, folio, guest } = await seedBookingWithBalance(hotel.id, 500);

    const session = await prisma.paymentSession.create({
      data: {
        hotelId: hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        guestId: guest.id,
        method: 'PLUTU',
        gateway: 'plutu',
        amount: 500,
        currency: 'LYD',
        status: 'PENDING',
        merchantTxId: 'pay_test_001',
        gatewayTransactionId: 'txn_success_001',
        idempotencyKey: 'pay_test_001',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const payload = buildPlutuWebhook({
      transaction_id: session.gatewayTransactionId!,
      order_id: session.merchantTxId!,
      amount: 500,
    });

    const res = await postWebhook('plutu', payload, hotel.id);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('succeeded');
    expect(json.data.paymentId).toBeDefined();

    const payment = await prisma.payment.findUnique({ where: { id: json.data.paymentId } });
    expect(payment).not.toBeNull();
    expect(payment!.status).toBe('SUCCEEDED');
    expect(payment!.method).toBe('PLUTU');
    expect(payment!.gateway).toBe('plutu');
    expect(Number(payment!.amount)).toBe(500);

    const updatedSession = await prisma.paymentSession.findUnique({ where: { id: session.id } });
    expect(updatedSession!.status).toBe('SUCCEEDED');
    expect(updatedSession!.paymentId).toBe(payment!.id);

    const updatedFolio = await prisma.folio.findUnique({ where: { id: folio.id } });
    expect(Number(updatedFolio!.totalPaid)).toBe(500);
    expect(Number(updatedFolio!.balance)).toBe(0);
    expect(updatedFolio!.status).toBe('SETTLED');

    const folioTx = await prisma.folioTransaction.findMany({
      where: { folioId: folio.id, type: 'PAYMENT' },
    });
    expect(folioTx).toHaveLength(1);
    expect(folioTx[0].amount).toBe(-500);

    const webhookRecord = await prisma.gatewayWebhook.findFirst({
      where: { provider: 'plutu', hotelId: hotel.id },
    });
    expect(webhookRecord!.status).toBe('PROCESSED');
    expect(webhookRecord!.paymentId).toBe(payment!.id);
  });

  it('TLync webhook SUCCESS → same ledger settlement flow', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'TLync Test Hotel', currency: 'LYD' } });
    const { booking, folio, guest } = await seedBookingWithBalance(hotel.id, 300);

    const session = await prisma.paymentSession.create({
      data: {
        hotelId: hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        guestId: guest.id,
        method: 'TLYNC',
        gateway: 'tlync',
        amount: 300,
        currency: 'LYD',
        status: 'PENDING',
        merchantTxId: 'pay_tlync_001',
        gatewayTransactionId: 'txn_tlync_success_001',
        idempotencyKey: 'pay_tlync_001',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const payload = buildTLyncWebhook({
      tran_id: session.gatewayTransactionId!,
      order_id: session.merchantTxId!,
      amount: 300,
    });

    const res = await postWebhook('tlync', payload, hotel.id);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const payment = await prisma.payment.findUnique({ where: { id: json.data.paymentId } });
    expect(payment!.method).toBe('TLYNC');
    expect(payment!.gateway).toBe('tlync');

    const updatedFolio = await prisma.folio.findUnique({ where: { id: folio.id } });
    expect(Number(updatedFolio!.balance)).toBe(0);
    expect(updatedFolio!.status).toBe('SETTLED');
  });

  it('Webhook FAILED → PaymentSession = FAILED, Folio unchanged', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'Failed Webhook Hotel', currency: 'LYD' } });
    const { booking, folio, guest } = await seedBookingWithBalance(hotel.id, 400);

    const session = await prisma.paymentSession.create({
      data: {
        hotelId: hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        guestId: guest.id,
        method: 'PLUTU',
        gateway: 'plutu',
        amount: 400,
        currency: 'LYD',
        status: 'PENDING',
        merchantTxId: 'pay_fail_001',
        gatewayTransactionId: 'txn_fail_001',
        idempotencyKey: 'pay_fail_001',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const payload = buildPlutuWebhook({
      transaction_id: session.gatewayTransactionId!,
      order_id: session.merchantTxId!,
      status: 'FAILED',
      amount: 400,
    });

    const res = await postWebhook('plutu', payload, hotel.id);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('failed');

    const updatedSession = await prisma.paymentSession.findUnique({ where: { id: session.id } });
    expect(updatedSession!.status).toBe('FAILED');

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment).toBeNull();

    const unchangedFolio = await prisma.folio.findUnique({ where: { id: folio.id } });
    expect(Number(unchangedFolio!.totalPaid)).toBe(0);
    expect(Number(unchangedFolio!.balance)).toBe(400);
    expect(unchangedFolio!.status).toBe('ACTIVE');
  });

  it('Idempotency: duplicate webhook → returns 200, no duplicate Payment/FolioTransaction', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'Idempotency Hotel', currency: 'LYD' } });
    const { booking, folio, guest } = await seedBookingWithBalance(hotel.id, 250);

    const session = await prisma.paymentSession.create({
      data: {
        hotelId: hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        guestId: guest.id,
        method: 'PLUTU',
        gateway: 'plutu',
        amount: 250,
        currency: 'LYD',
        status: 'PENDING',
        merchantTxId: 'pay_idemp_001',
        gatewayTransactionId: 'txn_idemp_001',
        idempotencyKey: 'pay_idemp_001',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const payload = buildPlutuWebhook({
      transaction_id: session.gatewayTransactionId!,
      order_id: session.merchantTxId!,
      amount: 250,
    });

    const res1 = await postWebhook('plutu', payload, hotel.id);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();

    const res2 = await postWebhook('plutu', payload, hotel.id);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.data.duplicate).toBe(true);

    const payments = await prisma.payment.findMany({ where: { bookingId: booking.id } });
    expect(payments).toHaveLength(1);

    const folioTxs = await prisma.folioTransaction.findMany({
      where: { folioId: folio.id, type: 'PAYMENT' },
    });
    expect(folioTxs).toHaveLength(1);

    const webhookRecords = await prisma.gatewayWebhook.findMany({
      where: { provider: 'plutu', hotelId: hotel.id },
    });
    expect(webhookRecords).toHaveLength(1);
  });

  it('Invalid signature → returns 401, no ledger changes', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'Bad Signature Hotel', currency: 'LYD' } });
    const { booking, folio, guest } = await seedBookingWithBalance(hotel.id, 600);

    const session = await prisma.paymentSession.create({
      data: {
        hotelId: hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        guestId: guest.id,
        method: 'PLUTU',
        gateway: 'plutu',
        amount: 600,
        currency: 'LYD',
        status: 'PENDING',
        merchantTxId: 'pay_badsig_001',
        gatewayTransactionId: 'txn_badsig_001',
        idempotencyKey: 'pay_badsig_001',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    mockPlutuAdapter.verifyWebhookSignature.mockReturnValueOnce(false);

    const payload = buildPlutuWebhook({
      transaction_id: session.gatewayTransactionId!,
      order_id: session.merchantTxId!,
      amount: 600,
    });

    const res = await postWebhook('plutu', payload, hotel.id);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment).toBeNull();

    const unchangedFolio = await prisma.folio.findUnique({ where: { id: folio.id } });
    expect(Number(unchangedFolio!.balance)).toBe(600);
  });

  it('Webhook for non-existent PaymentSession → returns 200 (no crash), matched: false', async () => {
    const hotel = await prisma.hotel.create({ data: { name: 'No Session Hotel', currency: 'LYD' } });

    const payload = buildPlutuWebhook({
      transaction_id: 'txn_nonexistent',
      order_id: 'ord_nonexistent',
      amount: 100,
    });

    const res = await postWebhook('plutu', payload, hotel.id);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.matched).toBe(false);
  });
});