import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { hashApiKey } from '@/lib/utils/api-key';
import { POST as adminApiKeysPOST, GET as adminApiKeysGET } from '@/app/api/admin/api-keys/route';
import {
  POST as adminApiKeyPOST,
  DELETE as adminApiKeyDELETE,
} from '@/app/api/admin/api-keys/[id]/route';
import { POST as externalBookingsPOST } from '@/app/api/external/bookings/route';

let data: Awaited<ReturnType<typeof seedTestData>>;
let superAdmin: { id: string };
const BASE_URL = 'http://localhost';

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
  superAdmin = await prisma.user.create({
    data: {
      email: 'super@platform.com',
      password: 'hashed',
      name: 'Super Admin',
      role: 'SUPER_ADMIN' as Role,
    },
  });
});

afterAll(async () => {
  await closeDb();
});

async function authRequest(userId: string, role: string, init: RequestInit = {}, hotelId: string | null = data.hotel.id) {
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

function apiKeyRequest(apiKey: string, body: unknown, hotelIdInBody?: string) {
  const payload: any = body;
  if (hotelIdInBody) payload.hotelId = hotelIdInBody;
  return new NextRequest('http://localhost/api/external/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(payload),
  });
}

function bookingPayload(externalRef: string, overrides: Record<string, any> = {}) {
  return {
    externalRef,
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
    guest: { name: 'Ali Ahmed', email: 'ali@example.com', phone: '+218911111111', idNumber: 'NID-001' },
    rooms: [{ roomTypeId: 'test-double', adults: 2, children: 0 }],
    payment: { amount: 600, currency: 'LYD', method: 'EXTERNAL', reference: 'PAY-1001' },
    ...overrides,
  };
}

async function createHotelScopedKey(
  userId: string,
  role: string,
  overrides: Record<string, any> = {}
) {
  const req = await authRequest(userId, role, {
    method: 'POST',
    headers: csrfHeaders('csrf-ak-1'),
    body: JSON.stringify({
      label: 'Test Agency',
      hotelId: data.hotel.id,
      partnerType: 'B2B_AGENCY',
      ...overrides,
    }),
  });
  const res = await adminApiKeysPOST(req, {});
  const body = await res.json();
  return { key: body.data.key, apiKey: body.data.apiKey, status: res.status };
}

describe('Admin API Keys — management', () => {
  it('administrator creates a hotel-scoped key and gets the plaintext exactly once', async () => {
    const { key, apiKey, status } = await createHotelScopedKey(data.admin.id, 'ADMIN');
    expect(status).toBe(201);
    expect(apiKey).toMatch(/^hk_[a-f0-9]{8}_/);
    expect(key.prefix).toBe(apiKey.split('_').slice(0, 2).join('_'));
    expect(key.hotelId).toBe(data.hotel.id);
    expect(key.scopes).toEqual(['bookings:write']);

    // Only the digest is stored — the raw key is unrecoverable.
    const stored = await prisma.apiKey.findUnique({ where: { id: key.id } });
    expect(stored?.keyHash).toBe(hashApiKey(apiKey));
    expect(stored?.keyHash).not.toBe(apiKey);
  });

  it('super admin can create a platform-wide key (hotelId null)', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-ak-2'),
      body: JSON.stringify({ label: 'Platform',
       partnerType: 'B2C_AGGREGATOR' }),
    });
    const res = await adminApiKeysPOST(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.key.hotelId).toBeNull();
  });

  it('manager cannot create a key for another hotel', async () => {
    const otherHotel = await prisma.hotel.create({ data: { name: 'Other' } });
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-ak-3'),
      body: JSON.stringify({ label: 'No', hotelId: otherHotel.id }),
    });
    const res = await adminApiKeysPOST(req, {});
    expect(res.status).toBe(403);
  });

  it('lists keys without exposing hashes', async () => {
    await createHotelScopedKey(data.admin.id, 'ADMIN');
    const req = await authRequest(data.admin.id, 'ADMIN', { method: 'GET' });
    const res = await adminApiKeysGET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].keyHash).toBeUndefined();
    expect(body.data[0].apiKey).toBeUndefined();
  });

  it('rotation invalidates the old key and returns a new plaintext', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');

    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-ak-4'),
      body: JSON.stringify({ action: 'rotate' }),
    });
    const res = await adminApiKeyPOST(req, { params: { id: created.key.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.apiKey).toMatch(/^hk_[a-f0-9]{8}_/);
    expect(body.data.apiKey).not.toBe(created.apiKey);

    // Old key is now dead.
    const oldReq = apiKeyRequest(created.apiKey, bookingPayload('EXT-9000'));
    const oldRes = await externalBookingsPOST(oldReq, {});
    expect(oldRes.status).toBe(401);

    // New key works.
    const newReq = apiKeyRequest(body.data.apiKey, bookingPayload('EXT-9001'));
    const newRes = await externalBookingsPOST(newReq, {});
    expect(newRes.status).toBe(201);
  });

  it('revoking a key blocks future requests', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');

    const req = await authRequest(data.admin.id, 'ADMIN', { method: 'DELETE' });
    const headers = new Headers(req.headers);
    headers.set('cookie', 'csrf-token=csrf-ak-revoke');
    headers.set('x-csrf-token', 'csrf-ak-revoke');
    const deleteReq = new NextRequest(BASE_URL, { method: 'DELETE', headers });
    const res = await adminApiKeyDELETE(deleteReq, { params: { id: created.key.id } });
    expect(res.status).toBe(200);

    const extReq = apiKeyRequest(created.apiKey, bookingPayload('EXT-9010'));
    const extRes = await externalBookingsPOST(extReq, {});
    expect(extRes.status).toBe(401);
  });
});

describe('External Booking API — POST /api/external/bookings', () => {
  it('rejects missing / invalid API keys', async () => {
    const reqMissing = new NextRequest('http://localhost/api/external/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload('EXT-1')),
    });
    const resMissing = await externalBookingsPOST(reqMissing, {});
    expect(resMissing.status).toBe(401);

    const reqBad = apiKeyRequest('hk_00000000_bogussecret', bookingPayload('EXT-2'));
    const resBad = await externalBookingsPOST(reqBad, {});
    expect(resBad.status).toBe(401);
  });

  it('creates a booked reservation with guest + folio ledger + payment', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');

    const req = apiKeyRequest(created.apiKey, bookingPayload('EXT-1001'));
    const res = await externalBookingsPOST(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();

    const booking = await prisma.booking.findUnique({
      where: { bookingNo: body.data.bookingNo },
      include: { folio: { include: { transactions: true } }, guest: true, payments: true },
    });
    expect(booking).not.toBeNull();
    expect(booking!.hotelId).toBe(data.hotel.id);
    expect(booking!.externalRef).toBe('EXT-1001');
    expect(booking!.guestName).toBe('Ali Ahmed');

    // Local guest created/linked.
    expect(booking!.guestId).toBe(body.data.guestId);
    expect(booking!.guest?.idNumber).toBe('NID-001');
    const folio = booking!.folio!;
    expect(folio.balance).toBe(0);
    expect(folio.totalCharges).toBe(600);
    expect(folio.status).toBe('SETTLED');
    expect(booking!.payments.length).toBe(1);
  });

  it('is idempotent on externalRef — retry returns duplicate without second booking', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');

    const first = await externalBookingsPOST(apiKeyRequest(created.apiKey, bookingPayload('EXT-2001')), {});
    expect(first.status).toBe(201);

    const second = await externalBookingsPOST(apiKeyRequest(created.apiKey, bookingPayload('EXT-2001')), {});
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.duplicate).toBe(true);

    const count = await prisma.booking.count({
      where: { hotelId: data.hotel.id, externalRef: 'EXT-2001' },
    });
    expect(count).toBe(1);
  });

  it('reuses the same local guest when idNumber matches', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');

    const first = await externalBookingsPOST(apiKeyRequest(created.apiKey, bookingPayload('EXT-3001')), {});
    const firstBody = await first.json();

    const second = await externalBookingsPOST(
      apiKeyRequest(
        created.apiKey,
        bookingPayload('EXT-3002', { guest: { name: 'Ali Ahmed', idNumber: 'NID-001' } })
      ),
      {}
    );
    const secondBody = await second.json();

    expect(secondBody.data.guestId).toBe(firstBody.data.guestId);
    const guests = await prisma.guest.count({
      where: { hotelId: data.hotel.id, idNumber: 'NID-001' },
    });
    expect(guests).toBe(1);
  });

  it('rejects a booking that targets another hotel (hotelId mismatch)', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN');
    const otherHotel = await prisma.hotel.create({ data: { name: 'Other' } });

    const req = apiKeyRequest(created.apiKey, bookingPayload('EXT-4001'), otherHotel.id);
    const res = await externalBookingsPOST(req, {});
    expect(res.status).toBe(403);

    // Omitting hotelId but referencing a foreign roomType is also rejected.
    const foreignRoomType = await prisma.roomType.create({
      data: { hotelId: otherHotel.id, name: 'Foreign', baseRate: 500, capacity: 2 },
    });
    const req2 = apiKeyRequest(
      created.apiKey,
      bookingPayload('EXT-4002', { rooms: [{ roomTypeId: foreignRoomType.id, adults: 2 }] })
    );
    const res2 = await externalBookingsPOST(req2, {});
    expect(res2.status).toBe(400);
  });

  it('does not allow a platform-wide key to create bookings', async () => {
    const req = await authRequest(superAdmin.id, 'SUPER_ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-ak-5'),
      body: JSON.stringify({ label: 'Platform', partnerType: 'B2C_AGGREGATOR' }),
    });
    const res = await adminApiKeysPOST(req, {});
    const body = await res.json();

    const extReq = apiKeyRequest(body.data.apiKey, bookingPayload('EXT-5001'));
    const extRes = await externalBookingsPOST(extReq, {});
    expect(extRes.status).toBe(403);
  });

  it('enforces scope — a read-only key cannot book', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN', {
      scopes: ['availability:read'],
    });
    const extReq = apiKeyRequest(created.apiKey, bookingPayload('EXT-6001'));
    const extRes = await externalBookingsPOST(extReq, {});
    expect(extRes.status).toBe(403);
  });

  it('enforces the per-minute rate limit', async () => {
    const created = await createHotelScopedKey(data.admin.id, 'ADMIN', { rateLimit: 1 });

    const first = await externalBookingsPOST(apiKeyRequest(created.apiKey, bookingPayload('EXT-7001')), {});
    expect(first.status).toBe(201);

    const second = await externalBookingsPOST(apiKeyRequest(created.apiKey, bookingPayload('EXT-7002')), {});
    expect(second.status).toBe(429);
  });
});