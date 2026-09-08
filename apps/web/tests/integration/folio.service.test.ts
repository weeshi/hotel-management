import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { FolioService } from '@/lib/services/folio.service';
import { prisma } from '../helpers/db';
import { resetDb, seedTestData, closeDb } from '../helpers/db';

const folioService = new FolioService();

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

async function createCheckedInBooking() {
  const booking = await prisma.booking.create({
    data: {
      bookingNo: 'BK-202606-0001',
      hotelId: data.hotel.id,
      guestName: 'ضيف الفاتورة',
      adults: 1,
      children: 0,
      status: 'CHECKED_IN',
      rooms: {
        create: {
          roomId: data.room101.id,
          nightlyRate: 200,
          checkIn: new Date('2026-07-01T14:00:00Z'),
          checkOut: new Date('2026-07-03T12:00:00Z'),
        },
      },
    },
  });

  const folio = await prisma.folio.create({
    data: {
      bookingId: booking.id,
      totalCharges: 0,
      totalPaid: 0,
      balance: 0,
    },
  });

  return { booking, folio };
}

describe('FolioService', () => {
  describe('getFolioByBooking', () => {
    it('should return folio for a booking', async () => {
      const { booking, folio } = await createCheckedInBooking();

      const result = await folioService.getFolioByBooking(booking.id, data.hotel.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(folio.id);
      expect(result?.status).toBe('ACTIVE');
    });

    it('should return null for booking without folio', async () => {
      const booking = await prisma.booking.create({
        data: {
          bookingNo: 'BK-202606-0002',
          hotelId: data.hotel.id,
          guestName: 'بدون فاتورة',
          adults: 1,
          children: 0,
          status: 'CONFIRMED',
          rooms: {
            create: {
              roomId: data.room101.id,
              nightlyRate: 200,
              checkIn: new Date('2026-07-01T14:00:00Z'),
              checkOut: new Date('2026-07-03T12:00:00Z'),
            },
          },
        },
      });

      const result = await folioService.getFolioByBooking(booking.id, data.hotel.id);
      expect(result).toBeNull();
    });
  });

  describe('addCharge', () => {
    it('should add a charge to folio and update balance', async () => {
      const { folio } = await createCheckedInBooking();

      const transaction = await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'مشروبات',
        amount: 150,
        category: 'SERVICE',
        createdById: data.admin.id,
      });

      expect(transaction.type).toBe('CHARGE');
      expect(transaction.amount).toBe(150);
      expect(transaction.category).toBe('SERVICE');

      const updated = await prisma.folio.findUnique({ where: { id: folio.id } });
      expect(Number(updated?.totalCharges)).toBe(150);
      expect(Number(updated?.balance)).toBe(150);
    });

    it('should add multiple charges and accumulate', async () => {
      const { folio } = await createCheckedInBooking();

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'مشروبات',
        amount: 100,
        category: 'SERVICE',
      });

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'غسيل',
        amount: 50,
        category: 'SERVICE',
      });

      const updated = await prisma.folio.findUnique({ where: { id: folio.id } });
      expect(Number(updated?.totalCharges)).toBe(150);
      expect(Number(updated?.balance)).toBe(150);
    });

    it('should throw for non-existent folio', async () => {
      await expect(
        folioService.addCharge('non-existent-id', data.hotel.id, {
          description: 'Test',
          amount: 100,
          category: 'SERVICE',
        })
      ).rejects.toThrow('Folio غير موجود');
    });

    it('should throw for settled folio', async () => {
      const { folio } = await createCheckedInBooking();

      await prisma.folio.update({
        where: { id: folio.id },
        data: { status: 'SETTLED' },
      });

      await expect(
        folioService.addCharge(folio.id, data.hotel.id, {
          description: 'Test',
          amount: 100,
          category: 'SERVICE',
        })
      ).rejects.toThrow('لا يمكن إضافة رسوم على فاتورة مسددة');
    });
  });

  describe('applyDiscount', () => {
    it('should apply a fixed discount', async () => {
      const { folio } = await createCheckedInBooking();

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'إقامة',
        amount: 400,
        category: 'ROOM_CHARGE',
      });

      await folioService.applyDiscount(folio.id, data.hotel.id, {
        type: 'FIXED',
        value: 50,
        reason: 'خصم عميل مميز',
        createdById: data.admin.id,
        userRole: 'ADMIN',
      });

      const updated = await prisma.folio.findUnique({ where: { id: folio.id } });
      expect(Number(updated?.balance)).toBe(350);

      const discounts = await prisma.folioDiscount.findMany({ where: { folioId: folio.id } });
      expect(discounts).toHaveLength(1);
      expect(Number(discounts[0].amount)).toBe(50);
    });

    it('should apply a percentage discount', async () => {
      const { folio } = await createCheckedInBooking();

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'إقامة',
        amount: 400,
        category: 'ROOM_CHARGE',
      });

      await folioService.applyDiscount(folio.id, data.hotel.id, {
        type: 'PERCENTAGE',
        value: 10,
        reason: 'خصم 10%',
        createdById: data.admin.id,
        userRole: 'ADMIN',
      });

      const updated = await prisma.folio.findUnique({ where: { id: folio.id } });
      expect(Number(updated?.balance)).toBe(360);
    });

    it('should reject discount exceeding total charges', async () => {
      const { folio } = await createCheckedInBooking();

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'إقامة',
        amount: 100,
        category: 'ROOM_CHARGE',
      });

      await expect(
        folioService.applyDiscount(folio.id, data.hotel.id, {
          type: 'FIXED',
          value: 200,
          reason: 'خصم كبير',
          createdById: data.admin.id,
          userRole: 'ADMIN',
        })
      ).rejects.toThrow('الخصم لا يتجاوز إجمالي الفاتورة');
    });

    it('should reject percentage over 100', async () => {
      const { folio } = await createCheckedInBooking();

      await expect(
        folioService.applyDiscount(folio.id, data.hotel.id, {
          type: 'PERCENTAGE',
          value: 150,
          reason: 'خصم كبير',
          createdById: data.admin.id,
          userRole: 'ADMIN',
        })
      ).rejects.toThrow('الخصم لا يتجاوز 100%');
    });
  });

  describe('processNightlyCharges', () => {
    it('should process pending scheduled charges', async () => {
      const { folio } = await createCheckedInBooking();

      await prisma.scheduledCharge.create({
        data: {
          folioId: folio.id,
          description: 'إيجار 101',
          amount: 200,
          chargeDate: new Date(Date.now() - 3600000),
        },
      });

      const count = await folioService.processNightlyCharges();
      expect(count).toBe(1);

      const transactions = await prisma.folioTransaction.findMany({
        where: { folioId: folio.id },
      });
      expect(transactions.length).toBeGreaterThan(0);
    });

    it('should skip folios without pending charges', async () => {
      const count = await folioService.processNightlyCharges();
      expect(count).toBe(0);
    });
  });

  describe('getFolioSummary', () => {
    it('should return full folio summary', async () => {
      const { booking, folio } = await createCheckedInBooking();

      await folioService.addCharge(folio.id, data.hotel.id, {
        description: 'إقامة',
        amount: 400,
        category: 'ROOM_CHARGE',
      });

      const summary = await folioService.getFolioSummary(folio.id, data.hotel.id);

      expect(summary.folioId).toBe(folio.id);
      expect(summary.totalCharges).toBe(400);
      expect(summary.guest).toBeDefined();
      expect(summary.guest.name).toBe('ضيف الفاتورة');
      expect(summary.rooms).toHaveLength(1);
      expect(summary.rooms[0].number).toBe('101');
      expect(summary.transactions).toHaveLength(1);
    });

    it('should throw for non-existent folio', async () => {
      await expect(
        folioService.getFolioSummary('non-existent-id', data.hotel.id)
      ).rejects.toThrow('Folio غير موجود');
    });
  });
});
