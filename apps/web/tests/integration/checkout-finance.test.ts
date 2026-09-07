import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BookingService } from '@/lib/services/booking.service';
import { prisma } from '../helpers/db';
import { resetDb, seedTestData, closeDb } from '../helpers/db';

const bookingService = new BookingService();
let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('Checkout Financial Firewall', () => {
  it('should THROW ValidationError when balance > 0', async () => {
    const booking: any = await bookingService.create({
      hotelId: data.hotel.id,
      guestName: 'ضيف مدين',
      adults: 1, children: 0,
      checkIn: '2026-07-01T14:00:00Z',
      checkOut: '2026-07-03T12:00:00Z',
      source: 'RECEPTION',
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
    });
    await bookingService.confirm(booking.id, data.hotel.id);
    await bookingService.checkIn(booking.id, data.hotel.id);

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    expect(Number(folio?.balance)).toBeGreaterThan(0);

    await expect(
      bookingService.checkOut(booking.id, data.hotel.id, data.admin.id)
    ).rejects.toThrow(/لا يمكن تسجيل الخروج/);
  });

  it('should SUCCEED when balance === 0 and set folio SETTLED', async () => {
    const booking: any = await bookingService.create({
      hotelId: data.hotel.id,
      guestName: 'ضيف مسدد',
      adults: 1, children: 0,
      checkIn: '2026-07-01T14:00:00Z',
      checkOut: '2026-07-03T12:00:00Z',
      source: 'RECEPTION',
      rooms: [{ roomId: data.room101.id, nightlyRate: 200 }],
    });
    await bookingService.confirm(booking.id, data.hotel.id);
    await bookingService.checkIn(booking.id, data.hotel.id);

    const folio = await prisma.folio.findUnique({ where: { bookingId: booking.id } });
    const balance = Number(folio!.balance);
    expect(balance).toBeGreaterThan(0);

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          hotelId: data.hotel.id,
          folioId: folio!.id,
          amount: balance,
          method: 'CASH',
          status: 'SUCCEEDED',
        },
      }),
      prisma.folioTransaction.create({
        data: {
          folioId: folio!.id,
          type: 'PAYMENT',
          category: 'PAYMENT',
          description: 'تسديد كامل',
          amount: -balance,
        },
      }),
      prisma.folio.update({
        where: { id: folio!.id },
        data: {
          totalPaid: { increment: balance },
          balance: { decrement: balance },
        },
      }),
    ]);

    const paidFolio = await prisma.folio.findUnique({ where: { id: folio!.id } });
    expect(Number(paidFolio?.balance)).toBe(0);

    const checkedOut = await bookingService.checkOut(booking.id, data.hotel.id, data.admin.id);
    expect(checkedOut.booking.status).toBe('CHECKED_OUT');

    const settledFolio = await prisma.folio.findUnique({ where: { id: folio!.id } });
    expect(settledFolio?.status).toBe('SETTLED');
    expect(settledFolio?.settledAt).toBeDefined();
    expect(settledFolio?.settledById).toBe(data.admin.id);
  });
});
