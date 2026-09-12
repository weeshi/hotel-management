import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { encryptSecret } from '@/lib/utils/crypto';
import {
  GET as integrationsGET,
  POST as integrationsPOST,
} from '@/app/api/admin/integrations/route';
import {
  GET as integrationGET,
  PATCH as integrationPATCH,
} from '@/app/api/admin/integrations/[engine]/route';
import { POST as integrationKeyPOST } from '@/app/api/admin/integrations/[engine]/key/route';
import { POST as injectPOST } from '@/app/api/integrations/[engine]/bookings/route';

const BASE_URL = 'http://localhost';

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  process.env.PAYMENT_CRYPTO_KEY = 'a'.repeat(64);
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

// --- Helpers ---

async function authRequest(
  userId: string,
  role: string,
  hotelId: string | undefined,
  init: RequestInit = {}
) {
  const token = await signAccessToken({ userId, role, hotelId });
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return new NextRequest(BASE_URL, {
    method: init.method,
    headers,
    body: init.body as BodyInit | null,
  });
}

function csrfHeaders(token: string) {
  return { cookie: `csrf-token=${token}`, 'x-csrf-token': token };
}

async function adminRequest(init: RequestInit = {}) {
  return authRequest(data.admin.id, data.admin.role as Role, data.hotel.id, init);
}

async function createIntegration(engine: string, hotelId: string, apiKey: string, isActive = true) {
  await prisma.integrationConfig.create({
    data: { hotelId, engine, apiKeyEnc: encryptSecret(apiKey), isActive },
  });
}

function externalRequest(engine: string, apiKey: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function canonicalBooking(overrides: Record<string, any> = {}) {
  return {
    externalRef: 'OTA-1001',
    guestName: 'ضيف خارجي',
    guestEmail: 'guest@test.com',
    adults: 2,
    children: 1,
    checkIn: '2026-08-01T14:00:00Z',
    checkOut: '2026-08-03T12:00:00Z',
    rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
    payment: { method: 'MOBICASH', amount: 400, currency: 'LYD', reference: 'TXN-9001' },
    ...overrides,
  };
}

// --- Admin integration config API ---

describe('IntegrationConfig — admin scoping + masked keys', () => {
  it('returns empty list when nothing configured', async () => {
    const req = await adminRequest({ method: 'GET' });
    const res = await integrationsGET(req, {});
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('upserts a config and never returns the key', async () => {
    const req = await adminRequest({
      method: 'POST',
      headers: csrfHeaders('t1'),
      body: JSON.stringify({ engine: 'custom', apiKey: 'sk_custom_123', isActive: true }),
    });
    const res = await integrationsPOST(req, {});
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.hasKey).toBe(true);
    expect(body.data.apiKey).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('sk_custom_123');

    const raw = await prisma.integrationConfig.findFirst({
      where: { hotelId: data.hotel.id, engine: 'custom' },
    });
    expect(raw?.apiKeyEnc).toBeTruthy();
    expect(raw?.apiKeyEnc).not.toContain('sk_custom_123');
  });

  it('generates a key once and exposes only hasKey afterwards', async () => {
    const req = await adminRequest({ method: 'POST', headers: csrfHeaders('t2') });
    const res = await integrationKeyPOST(req, { params: { engine: 'booking.com' } });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.apiKey).toBe('string');
    expect(body.data.apiKey).toMatch(/^[0-9a-f]{64}$/);

    const getReq = await adminRequest({ method: 'GET' });
    const getRes = await integrationGET(getReq, { params: { engine: 'booking.com' } });
    const getBody: any = await getRes.json();
    expect(getBody.data.hasKey).toBe(true);
    expect(getBody.data.apiKey).toBeUndefined();
  });

  it('rejects unknown engines', async () => {
    const req = await adminRequest({
      method: 'POST',
      headers: csrfHeaders('t3'),
      body: JSON.stringify({ engine: 'nope' }),
    });
    const res = await integrationsPOST(req, {});
    expect(res.status).toBe(400);
  });

  it('returns 404 for a config owned by another hotel', async () => {
    const otherHotel = await prisma.hotel.create({ data: { name: 'فندق آخر' } });
    await prisma.integrationConfig.create({
      data: { hotelId: otherHotel.id, engine: 'custom', apiKeyEnc: 'x' },
    });

    const req = await adminRequest({ method: 'GET' });
    const res = await integrationGET(req, { params: { engine: 'custom' } });
    expect(res.status).toBe(404);
  });
});

// --- External booking injection ---

describe('External booking injection — Decoupled PMS Ledger', () => {
  it('rejects missing API key and unknown engine', async () => {
    const noKey = externalRequest('custom', null, canonicalBooking());
    const noKeyRes = await injectPOST(noKey, { params: { engine: 'custom' } });
    expect(noKeyRes.status).toBe(401);

    const unknown = externalRequest('nope', 'whatever', canonicalBooking());
    const unknownRes = await injectPOST(unknown, { params: { engine: 'nope' } });
    expect(unknownRes.status).toBe(404);
  });

  it('rejects an invalid API key (401) and an inactive config', async () => {
    await createIntegration('custom', data.hotel.id, 'good-key');
    await createIntegration('booking.com', data.hotel.id, 'inactive-key', false);

    const badKey = externalRequest('custom', 'wrong-key', canonicalBooking());
    const badKeyRes = await injectPOST(badKey, { params: { engine: 'custom' } });
    expect(badKeyRes.status).toBe(401);

    const inactive = externalRequest('booking.com', 'inactive-key', canonicalBooking());
    const inactiveRes = await injectPOST(inactive, { params: { engine: 'booking.com' } });
    expect(inactiveRes.status).toBe(401);
  });

  it('injects a confirmed booking + payment ledger in one shot', async () => {
    await createIntegration('custom', data.hotel.id, 'good-key');

    const res = await injectPOST(externalRequest('custom', 'good-key', canonicalBooking()), {
      params: { engine: 'custom' },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.received).toBe(true);
    expect(body.bookingNo).toMatch(/^BK-\d{6}-\d{4}$/);
    expect(body.folioId).toBeTruthy();
    expect(body.paymentId).toBeTruthy();
  });

  it('creates booking with folio charges, payment and settled folio', async () => {
    await createIntegration('custom', data.hotel.id, 'good-key');

    const res = await injectPOST(externalRequest('custom', 'good-key', canonicalBooking()), {
      params: { engine: 'custom' },
    });
    const body: any = await res.json();

    const booking = await prisma.booking.findFirst({
      where: { hotelId: data.hotel.id, externalRef: 'OTA-1001' },
      include: { folio: true },
    });
    expect(booking).toBeTruthy();
    expect(booking!.status).toBe('CONFIRMED');
    expect(booking!.guestEmail).toBe('guest@test.com');
    expect(booking!.source).toBe('WEBSITE');

    const folio = booking!.folio!;
    expect(Number(folio.totalCharges)).toBe(400);
    expect(Number(folio.totalPaid)).toBe(400);
    expect(Number(folio.balance)).toBe(0);
    expect(folio.status).toBe('SETTLED');

    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    expect(payment?.status).toBe('SUCCEEDED');
    expect(payment?.method).toBe('MOBICASH');
    expect(payment?.gateway).toBe('custom');
    expect(payment?.externalRef).toBe('TXN-9001');
    expect(payment?.bookingId).toBe(booking!.id);
  });

  it('is idempotent — duplicate delivery never double-injects', async () => {
    await createIntegration('custom', data.hotel.id, 'good-key');

    async function inject() {
      const res = await injectPOST(externalRequest('custom', 'good-key', canonicalBooking()), {
        params: { engine: 'custom' },
      });
      return res;
    }

    const first = await inject();
    expect(first.status).toBe(200);
    const second = await inject();
    expect(second.status).toBe(200);
    const secondBody: any = await second.json();
    expect(secondBody.duplicate).toBe(true);

    const bookings = await prisma.booking.findMany({
      where: { hotelId: data.hotel.id, externalRef: 'OTA-1001' },
    });
    expect(bookings.length).toBe(1);

    const payments = await prisma.payment.findMany({
      where: { hotelId: data.hotel.id, bookingId: bookings[0].id },
    });
    expect(payments.length).toBe(1);

    const ledger = await prisma.gatewayWebhook.findMany({
      where: { provider: 'custom', hotelId: data.hotel.id, eventId: 'OTA-1001' },
    });
    expect(ledger.length).toBe(1);
    expect(ledger[0].status).toBe('PROCESSED');
  });

  it('keeps tenants isolated — each key injects only into its own hotel', async () => {
    const otherHotel = await prisma.hotel.create({ data: { name: 'فندق آخر' } });
    const otherType = await prisma.roomType.create({
      data: { hotelId: otherHotel.id, name: 'Single2', baseRate: 200, capacity: 1 },
    });
    const otherRoom = await prisma.room.create({
      data: { hotelId: otherHotel.id, roomNumber: '201', floor: 2, roomTypeId: otherType.id, status: 'AVAILABLE' },
    });
    await createIntegration('custom', data.hotel.id, 'hotel1-key');
    await createIntegration('custom', otherHotel.id, 'hotel2-key');

    await injectPOST(externalRequest('custom', 'hotel1-key', canonicalBooking()), {
      params: { engine: 'custom' },
    });
    await injectPOST(
      externalRequest('custom', 'hotel2-key', canonicalBooking({ externalRef: 'OTA-2001', rooms: [{ roomId: otherRoom.id, nightlyRate: 200 }] })),
      { params: { engine: 'custom' } },
    );

    const hotel1Bookings = await prisma.booking.findMany({
      where: { hotelId: data.hotel.id, externalRef: 'OTA-1001' },
    });
    const hotel2Bookings = await prisma.booking.findMany({
      where: { hotelId: otherHotel.id, externalRef: 'OTA-2001' },
    });
    expect(hotel1Bookings.length).toBe(1);
    expect(hotel2Bookings.length).toBe(1);
  });

  it('rejects an invalid payload (400) and an unknown room (400)', async () => {
    await createIntegration('custom', data.hotel.id, 'good-key');

    const noRef = externalRequest('custom', 'good-key', canonicalBooking({ externalRef: '' }));
    const noRefRes = await injectPOST(noRef, { params: { engine: 'custom' } });
    expect(noRefRes.status).toBe(400);

    const badRoom = externalRequest(
      'custom',
      'good-key',
      canonicalBooking({ rooms: [{ roomId: '00000000-0000-0000-0000-000000000000', nightlyRate: 100 }] })
    );
    const badRoomRes = await injectPOST(badRoom, { params: { engine: 'custom' } });
    expect(badRoomRes.status).toBe(400);
  });

  it('normalizes booking.com payloads into the canonical shape', async () => {
    await createIntegration('booking.com', data.hotel.id, 'bc-key');

    const bookingComBody = {
      reservation: {
        reservation_number: 'BC-777',
        guest: { name: 'جون دو', email: 'john@test.com' },
        arrival_date: '2026-09-01T14:00:00Z',
        departure_date: '2026-09-02T12:00:00Z',
        adults: 1,
        children: 0,
        rooms: [{ room_id: data.room101.id, nightly_rate: 150 }],
        payment: { method: 'CASH', amount: 150, currency: 'LYD' },
      },
    };

    const res = await injectPOST(externalRequest('booking.com', 'bc-key', bookingComBody), {
      params: { engine: 'booking.com' },
    });
    expect(res.status).toBe(200);

    const booking = await prisma.booking.findFirst({
      where: { hotelId: data.hotel.id, externalRef: 'BC-777' },
    });
    expect(booking).toBeTruthy();
    expect(booking!.guestName).toBe('جون دو');
  });
});
