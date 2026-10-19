import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import { GET as statusGET } from '@/app/api/public/bookings/[id]/payment-session/[sessionId]/status/route';

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 30,
    current: 1,
    remaining: 29,
    resetAt: 9999999999,
  }),
}));

const bookingService = new BookingService();
let data: Awaited<ReturnType<typeof seedTestData>>;
let booking: any;

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
});

afterAll(async () => {
  await closeDb();
});

function callStatus(bookingId: string, sessionId: string) {
  return statusGET(
    new NextRequest(`http://localhost/api/public/bookings/${bookingId}/payment-session/${sessionId}/status`),
    { params: Promise.resolve({ id: bookingId, sessionId }) }
  );
}

function createSession(overrides: { bookingId: string; status?: string }) {
  return prisma.paymentSession.create({
    data: {
      hotelId: data.hotel.id,
      bookingId: overrides.bookingId,
      method: 'PLUTU',
      gateway: 'plutu',
      amount: 200,
      currency: 'LYD',
      status: overrides.status ?? 'PENDING',
    },
  });
}

describe('Payment Session Status — Lightweight Polling Endpoint', () => {
  it('returns verified=false while the session is PENDING', async () => {
    const session = await createSession({ bookingId: booking.id });

    const res = await callStatus(booking.id, session.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ verified: false });
  });

  it('returns verified=true once the webhook set SUCCEEDED', async () => {
    const session = await createSession({ bookingId: booking.id });
    await prisma.paymentSession.update({
      where: { id: session.id },
      data: { status: 'SUCCEEDED' },
    });

    const res = await callStatus(booking.id, session.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual({ verified: true });
  });

  it('scopes the session to its own booking — 404 for a foreign bookingId', async () => {
    const other = await prisma.booking.create({
      data: { hotelId: data.hotel.id, bookingNo: 'ST-OTHER-2', guestName: 'حجز آخر' },
    });
    const session = await createSession({ bookingId: booking.id });

    const res = await callStatus(other.id, session.id);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 404 for an unknown session id', async () => {
    const res = await callStatus(booking.id, 'does-not-exist');
    expect(res.status).toBe(404);
  });
});