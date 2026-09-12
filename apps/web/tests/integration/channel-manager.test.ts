import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@hotel/shared';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { signAccessToken } from '@/lib/utils/jwt';
import { POST as adminApiKeysPOST } from '@/app/api/admin/api-keys/route';
import { POST as mappingPOST, GET as mappingGET } from '@/app/api/admin/channel-manager/mappings/route';
import { GET as previewGET } from '@/app/api/admin/channel-manager/preview/route';
import { POST as publishPOST } from '@/app/api/admin/channel-manager/publish/route';
import { POST as inboundPOST } from '@/app/api/external/channel/[provider]/bookings/route';
import { enqueuePublishJobs } from '@/workers/queue';

vi.mock('@/workers/queue', () => ({
  enqueuePublishJobs: vi.fn(),
  formatLocalDate: (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
}));

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

async function authRequest(userId: string, role: string, init: RequestInit = {}) {
  const token = await signAccessToken({ userId, role, hotelId: data.hotel.id });
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return new NextRequest(BASE_URL, { method: init.method, headers, body: init.body as BodyInit | null });
}

function csrfHeaders(token: string) {
  return { cookie: `csrf-token=${token}`, 'x-csrf-token': token };
}

async function createChannelKey() {
  const req = await authRequest(data.admin.id, 'ADMIN', {
    method: 'POST',
    headers: csrfHeaders('csrf-ch-1'),
    body: JSON.stringify({
      label: 'Channel Manager',
      hotelId: data.hotel.id,
      partnerType: 'CHANNEL_MANAGER',
      scopes: ['bookings:write'],
    }),
  });
  const res = await adminApiKeysPOST(req, {});
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.apiKey;
}

describe('Channel Manager — mappings', () => {
  it('creates a mapping between an OTA room type and a local room type', async () => {
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-m-1'),
      body: JSON.stringify({
        provider: 'BOOKING_COM',
        channelRoomTypeId: 'OTA-DBL',
        channelName: 'Deluxe Double',
        roomTypeId: data.doubleType.id,
      }),
    });
    const res = await mappingPOST(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.roomTypeId).toBe(data.doubleType.id);
    expect(body.data.provider).toBe('BOOKING_COM');

    const stored = await prisma.channelMapping.findFirst({
      where: { hotelId: data.hotel.id, channelRoomTypeId: 'OTA-DBL' },
    });
    expect(stored).not.toBeNull();
  });

  it('lists mappings scoped to the hotel', async () => {
    await prisma.channelMapping.create({
      data: {
        hotelId: data.hotel.id,
        provider: 'EXPEDIA',
        channelRoomTypeId: 'X-1',
        roomTypeId: data.singleType.id,
      },
    });
    const req = await authRequest(data.admin.id, 'ADMIN', { method: 'GET' });
    const res = await mappingGET(req, {});
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].provider).toBe('EXPEDIA');
  });

  it('rejects a mapping referencing a foreign room type', async () => {
    const other = await prisma.hotel.create({ data: { name: 'Other' } });
    const foreignType = await prisma.roomType.create({
      data: { hotelId: other.id, name: 'Foreign', baseRate: 100, capacity: 2 },
    });
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-m-2'),
      body: JSON.stringify({
        provider: 'AGODA',
        channelRoomTypeId: 'A-9',
        roomTypeId: foreignType.id,
      }),
    });
    const res = await mappingPOST(req, {});
    expect(res.status).toBe(400);
  });
});

describe('Channel Manager — availability preview / publish', () => {
  beforeEach(async () => {
    await prisma.channelMapping.createMany({
      data: [
        { hotelId: data.hotel.id, provider: 'BOOKING_COM', channelRoomTypeId: 'OTA-SNG', roomTypeId: data.singleType.id },
        { hotelId: data.hotel.id, provider: 'BOOKING_COM', channelRoomTypeId: 'OTA-DBL', roomTypeId: data.doubleType.id },
      ],
    });
  });

  it('builds an availability + rate snapshot for mapped room types', async () => {
    const token = await signAccessToken({ userId: data.admin.id, role: 'ADMIN', hotelId: data.hotel.id });
    const req = new NextRequest('http://localhost/api/admin/channel-manager/preview?provider=BOOKING_COM&from=2026-11-01&to=2026-11-04', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await previewGET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    // 2 room types × 3 nights = 6 snapshot rows
    expect(body.data).toHaveLength(6);
    const dbl = body.data.find((s: any) => s.roomTypeId === data.doubleType.id);
    expect(dbl.nightlyRate).toBe(300); // baseRate
    expect(dbl.available).toBe(1); // room102 AVAILABLE
  });

  it('enqueues pushToOTA jobs and returns 202 without synchronous persistence', async () => {
    vi.mocked(enqueuePublishJobs).mockResolvedValueOnce({ mappings: 2, accepted: 4, skipped: 0 });
    const req = await authRequest(data.admin.id, 'ADMIN', {
      method: 'POST',
      headers: csrfHeaders('csrf-p-1'),
      body: JSON.stringify({
        provider: 'BOOKING_COM',
        from: '2026-11-01',
        to: '2026-11-03',
      }),
    });
    const res = await publishPOST(req, {});
    const body = await res.json();
    expect(res.status).toBe(202);
    expect(body.data).toMatchObject({
      queued: true,
      mappings: 2,
      accepted: 4,
      skipped: 0,
      from: '2026-11-01',
      to: '2026-11-03',
    });
    expect(enqueuePublishJobs).toHaveBeenCalledWith({
      hotelId: data.hotel.id,
      provider: 'BOOKING_COM',
      from: new Date('2026-11-01T00:00:00'),
      to: new Date('2026-11-03T00:00:00'),
    });

    // Publishing is async now: nothing is persisted synchronously.
    const count = await prisma.channelPriceSnapshot.count({
      where: { hotelId: data.hotel.id, provider: 'BOOKING_COM' },
    });
    expect(count).toBe(0);
  });
});

describe('Channel Manager — inbound OTA booking webhook', () => {
  it('ingests a confirmed OTA booking by resolving the channel mapping', async () => {
    await prisma.channelMapping.create({
      data: {
        hotelId: data.hotel.id,
        provider: 'BOOKING_COM',
        channelRoomTypeId: 'OTA-DBL',
        roomTypeId: data.doubleType.id,
      },
    });
    const apiKey = await createChannelKey();

    const req = new NextRequest('http://localhost/api/external/channel/BOOKING_COM/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        externalRef: 'OTA-REF-1001',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        channelRoomTypeId: 'OTA-DBL',
        guestName: 'OTA Guest',
        guestEmail: 'ota@example.com',
        adults: 2,
        paymentAmount: 900,
        currency: 'LYD',
        status: 'CONFIRMED',
      }),
    });
    const res = await inboundPOST(req, { params: { provider: 'BOOKING_COM' } });
    expect(res.status).toBe(201);
    const body = await res.json();

    const booking = await prisma.booking.findUnique({
      where: { bookingNo: body.data.bookingNo },
      include: { folio: true, payments: true },
    });
    expect(booking).not.toBeNull();
    expect(booking!.hotelId).toBe(data.hotel.id);
    expect(booking!.externalRef).toBe('OTA-REF-1001');
    expect(booking!.source).toBe('PARTNER');
    expect(booking!.folio!.balance).toBe(0);
    expect(booking!.folio!.status).toBe('SETTLED');
    expect(booking!.payments.length).toBe(1);
  });

  it('is idempotent on externalRef for retries', async () => {
    await prisma.channelMapping.create({
      data: {
        hotelId: data.hotel.id,
        provider: 'EXPEDIA',
        channelRoomTypeId: 'EX-SNG',
        roomTypeId: data.singleType.id,
      },
    });
    const apiKey = await createChannelKey();
    const payload = {
      externalRef: 'OTA-REF-2001',
      checkIn: '2026-12-05',
      checkOut: '2026-12-06',
      channelRoomTypeId: 'EX-SNG',
      guestName: 'Repeat Guest',
      adults: 1,
    };

    const first = await inboundPOST(
      new NextRequest('http://localhost/api/external/channel/EXPEDIA/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload),
      }),
      { params: { provider: 'EXPEDIA' } }
    );
    expect(first.status).toBe(201);

    const second = await inboundPOST(
      new NextRequest('http://localhost/api/external/channel/EXPEDIA/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload),
      }),
      { params: { provider: 'EXPEDIA' } }
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.duplicate).toBe(true);

    const count = await prisma.booking.count({ where: { externalRef: 'OTA-REF-2001' } });
    expect(count).toBe(1);
  });

  it('rejects an unmapped OTA room type with a clear error', async () => {
    const apiKey = await createChannelKey();
    const req = new NextRequest('http://localhost/api/external/channel/BOOKING_COM/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        externalRef: 'OTA-REF-3001',
        checkIn: '2026-12-10',
        checkOut: '2026-12-11',
        channelRoomTypeId: 'NOT-MAPPED',
        guestName: 'No Mapping',
        adults: 1,
      }),
    });
    const res = await inboundPOST(req, { params: { provider: 'BOOKING_COM' } });
    expect(res.status).toBe(400);
  });

  it('rejects a platform-wide key (no hotelId) for inbound bookings', async () => {
    // Super admin creates a platform-wide key (hotelId null).
    const superAuth = await (async () => {
      const token = await signAccessToken({ userId: superAdmin.id, role: 'SUPER_ADMIN' });
      return new NextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-csrf-token': 'csrf-ch-3',
          Cookie: 'csrf-token=csrf-ch-3',
        },
        body: JSON.stringify({ label: 'Platform Channel', partnerType: 'CHANNEL_MANAGER' }),
      });
    })();
    const keyRes = await adminApiKeysPOST(superAuth, {});
    const keyBody = await keyRes.json();
    expect(keyRes.status).toBe(201);
    expect(keyBody.data.key.hotelId).toBeNull();
    const platformKey = keyBody.data.apiKey;

    const inbound = new NextRequest('http://localhost/api/external/channel/BOOKING_COM/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': platformKey },
      body: JSON.stringify({
        externalRef: 'OTA-REF-4001',
        channelRoomTypeId: 'X',
        guestName: 'G',
      }),
    });
    const res = await inboundPOST(inbound, { params: { provider: 'BOOKING_COM' } });
    expect(res.status).toBe(403);
  });
});