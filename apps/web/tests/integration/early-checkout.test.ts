import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';

const bookingService = new BookingService();

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

// --- Helpers ---

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

async function createPolicy(name: string, tiers: unknown[]) {
  return prisma.cancellationPolicy.create({
    data: { hotelId: data.hotel.id, name, rules: JSON.stringify(tiers) },
  });
}

async function createReceptionBooking(opts: {
  checkIn: string;
  checkOut: string;
  rooms: Array<{ roomId: string; nightlyRate: number }>;
  cancellationPolicyId?: string;
}) {
  const booking = await bookingService.create({
    hotelId: data.hotel.id,
    guestName: 'نزيل مبكر',
    adults: 1,
    children: 0,
    checkIn: opts.checkIn,
    checkOut: opts.checkOut,
    source: 'RECEPTION',
    cancellationPolicyId: opts.cancellationPolicyId,
    rooms: opts.rooms,
  });
  await bookingService.confirm(booking.id, data.hotel.id);
  await bookingService.checkIn(booking.id, data.hotel.id);
  return booking;
}

async function payOffFolio(folioId: string) {
  const folio = await prisma.folio.findUnique({ where: { id: folioId } });
  const balance = Number(folio!.balance);
  expect(balance).toBeGreaterThan(0);
  await prisma.$transaction([
    prisma.payment.create({
      data: { hotelId: data.hotel.id, folioId, amount: balance, method: 'CASH', status: 'SUCCEEDED' },
    }),
    prisma.folioTransaction.create({
      data: {
        folioId,
        type: 'PAYMENT',
        category: 'PAYMENT',
        description: 'تسديد كامل',
        amount: -balance,
      },
    }),
    prisma.folio.update({
      where: { id: folioId },
      data: { totalPaid: { increment: balance }, balance: { decrement: balance } },
    }),
  ]);
}

function refundTransactions(folio: any) {
  return folio.transactions.filter((t: any) => t.type === 'REFUND');
}

// --- Tests ---

describe('Early Checkout Refunds', () => {
  it('should refund 50% of unused nights on early checkout', async () => {
    const policy = await createPolicy('Half', [{ refundPercentage: 50, cancelBeforeHours: 0 }]);
    const booking = await createReceptionBooking({
      checkIn: isoDate(-2),
      checkOut: isoDate(2),
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      cancellationPolicyId: policy.id,
    });

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio?.totalCharges)).toBe(800);
    await payOffFolio(folio!.id);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const after = await prisma.folio.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true },
    });
    expect(Number(after?.balance)).toBe(-200);
    expect(Number(after?.totalCharges)).toBe(600);

    const refunds = refundTransactions(after!);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(-200);
    expect(refunds[0].category).toBe('ROOM_CHARGE');
  });

  it('should refund only the room still having unused nights', async () => {
    const policy = await createPolicy('Half', [{ refundPercentage: 50, cancelBeforeHours: 0 }]);
    const booking = await createReceptionBooking({
      checkIn: isoDate(-2),
      checkOut: isoDate(2),
      rooms: [
        { roomId: data.room101.id, nightlyRate: 200 },
        { roomId: data.room102.id, nightlyRate: 300 },
      ],
      cancellationPolicyId: policy.id,
    });

    // Room 102 is scheduled to depart today → no unused nights left
    const room102Booking = await prisma.bookingRoom.findFirst({
      where: { bookingId: booking.id, roomId: data.room102.id },
    });
    await prisma.bookingRoom.update({
      where: { id: room102Booking!.id },
      data: { checkOut: new Date(isoDate(0)) },
    });

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio?.totalCharges)).toBe(2000);
    await payOffFolio(folio!.id);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const after = await prisma.folio.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true },
    });
    const refunds = refundTransactions(after!);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].description).toContain('101');
    expect(Number(refunds[0].amount)).toBe(-200);
    expect(Number(after?.balance)).toBe(-200);

    const r101 = await prisma.bookingRoom.findFirst({
      where: { bookingId: booking.id, roomId: data.room101.id },
    });
    const r102 = await prisma.bookingRoom.findFirst({
      where: { bookingId: booking.id, roomId: data.room102.id },
    });
    expect(r101!.checkOut.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(r102!.checkOut.toISOString().slice(0, 10)).toBe(isoDate(0).slice(0, 10));
  });

  it('should fully refund unused nights when no cancellation policy exists', async () => {
    const booking = await createReceptionBooking({
      checkIn: isoDate(-1),
      checkOut: isoDate(3),
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
    });

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio?.totalCharges)).toBe(800);
    await payOffFolio(folio!.id);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const after = await prisma.folio.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true },
    });
    const refunds = refundTransactions(after!);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(-600);
    expect(Number(after?.balance)).toBe(-600);
  });

  it('should not refund when the policy grants 0%', async () => {
    const policy = await createPolicy('Zero', [{ refundPercentage: 0, cancelBeforeHours: 0 }]);
    const booking = await createReceptionBooking({
      checkIn: isoDate(-2),
      checkOut: isoDate(2),
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      cancellationPolicyId: policy.id,
    });

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    await payOffFolio(folio!.id);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const after = await prisma.folio.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true },
    });
    expect(refundTransactions(after!)).toHaveLength(0);
    expect(Number(after?.balance)).toBe(0);
  });

  it('should apply the highest refundPercentage across policy tiers', async () => {
    const policy = await createPolicy('Tiers', [
      { refundPercentage: 0, cancelBeforeHours: 0 },
      { refundPercentage: 50, cancelBeforeHours: 24 },
      { refundPercentage: 100, cancelBeforeHours: 48 },
    ]);
    const booking = await createReceptionBooking({
      checkIn: isoDate(-2),
      checkOut: isoDate(2),
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
      cancellationPolicyId: policy.id,
    });

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    await payOffFolio(folio!.id);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const after = await prisma.folio.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true },
    });
    const refunds = refundTransactions(after!);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(-400);
    expect(Number(after?.balance)).toBe(-400);
  });
});
