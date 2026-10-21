import { describe, it, expect, beforeEach, afterAll, vi, beforeAll } from 'vitest';
import { prisma, resetDb, seedTestData, closeDb } from '../helpers/db';
import {
  processPurgeVCC,
  processPurgeVCCProcessor,
  PURGE_JOB_OPTIONS,
} from '@/workers/jobs/purgeVCC.job';
import { subDays } from 'date-fns';

// Mock VGS client before importing processPurgeVCC
vi.mock('@/lib/integrations/vgs-client', () => ({
  vgsDeleteToken: vi.fn(),
  vgsPurgeAllTokens: vi.fn(),
  getVGSManagementBaseUrl: vi.fn(),
}));

// Mock the queue module so the dispatcher test never touches Redis/BullMQ.
vi.mock('@/workers/queue', () => ({
  runDailyVCCPurgeScan: vi.fn(),
  getQueue: vi.fn(),
}));

import { vgsDeleteToken } from '@/lib/integrations/vgs-client';
import { runDailyVCCPurgeScan } from '@/workers/queue';

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeAll(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('VCC Purge Flow — Processor Unit Tests', () => {
  let bookingId: string;
  let paymentId: string;
  const vaultId = 'vlt_test_123';

  beforeEach(async () => {
    await resetDb();
    data = await seedTestData();

    const checkOutDate = subDays(new Date(), 8);
    checkOutDate.setHours(12, 0, 0, 0);

    const booking = await prisma.booking.create({
      data: {
        hotelId: data.hotel.id,
        bookingNo: `TEST-VCC-${Date.now()}`,
        guestId: (await prisma.guest.create({
          data: {
            hotelId: data.hotel.id,
            name: 'Test Guest VCC',
            email: 'vcc-guest@test.com',
          },
        })).id,
        status: 'CHECKED_OUT',
        rooms: {
          create: {
            roomId: data.room101.id,
            roomTypeId: data.singleType.id,
            ratePlanId: null,
            nightlyRate: 200,
            checkIn: subDays(new Date(), 10),
            checkOut: checkOutDate,
          },
        },
      },
    });
    bookingId = booking.id;

    const folio = await prisma.folio.create({
      data: {
        bookingId: booking.id,
        totalCharges: 1000,
        balance: 0,
        status: 'SETTLED',
      },
    });

    const payment = await prisma.payment.create({
      data: {
        hotelId: data.hotel.id,
        bookingId: booking.id,
        folioId: folio.id,
        amount: 1000,
        currency: 'LYD',
        method: 'VCC',
        gateway: 'vgs',
        status: 'SUCCEEDED',
        vccToken: 'tok_visa_abc123',
        vccExpiryToken: 'tok_exp_xyz789',
        vccCVVToken: 'tok_cvv_uvw012',
        vccHolderName: 'TEST GUEST',
        vgsVaultId: vaultId,
        vccPurgedAt: null,
      },
    });
    paymentId = payment.id;
  });

  describe('processPurgeVCC', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should purge all three tokens and mark payment as fully purged', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 204 });

      const tokenTypes = ['number', 'expiry', 'cvv'] as const;
      for (const tokenType of tokenTypes) {
        await processPurgeVCC({ paymentId, tokenType, attempt: 1 });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment!.vccToken).toBeNull();
      expect(payment!.vccExpiryToken).toBeNull();
      expect(payment!.vccCVVToken).toBeNull();
      expect(payment!.vccPurgedAt).not.toBeNull();

      const auditLogs = await prisma.vCCAuditLog.findMany({
        where: { paymentId },
        orderBy: { createdAt: 'asc' },
      });
      expect(auditLogs.length).toBe(4);

      const tokenPurgedLogs = auditLogs.filter((l) => l.action === 'token_purged');
      expect(tokenPurgedLogs.length).toBe(3);

      const tokenTypesResult = tokenPurgedLogs.map((l) => {
        const meta = JSON.parse(l.metadata || '{}');
        return meta.tokenType;
      }).sort();
      expect(tokenTypesResult).toEqual(['cvv', 'expiry', 'number']);

      const finalPurgeLog = auditLogs.find((l) => l.action === 'purged');
      expect(finalPurgeLog).toBeDefined();
      expect(finalPurgeLog!.vccTokenRef).toBe('ALL_TOKENS');
      const finalMeta = JSON.parse(finalPurgeLog!.metadata || '{}');
      expect(finalMeta.fullyPurged).toBe(true);

      expect(vgsDeleteToken).toHaveBeenCalledTimes(3);
      expect(vgsDeleteToken).toHaveBeenCalledWith(vaultId, 'tok_visa_abc123');
      expect(vgsDeleteToken).toHaveBeenCalledWith(vaultId, 'tok_exp_xyz789');
      expect(vgsDeleteToken).toHaveBeenCalledWith(vaultId, 'tok_cvv_uvw012');
    });

    it('should handle VGS 404 as success (idempotency)', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 404 });

      const tokenTypes = ['number', 'expiry', 'cvv'] as const;
      for (const tokenType of tokenTypes) {
        await processPurgeVCC({ paymentId, tokenType, attempt: 1 });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment!.vccToken).toBeNull();
      expect(payment!.vccExpiryToken).toBeNull();
      expect(payment!.vccCVVToken).toBeNull();
      expect(payment!.vccPurgedAt).not.toBeNull();

      const auditLogs = await prisma.vCCAuditLog.findMany({
        where: { paymentId },
        orderBy: { createdAt: 'asc' },
      });

      const tokenPurgedLogs = auditLogs.filter((l) => l.action === 'token_purged');
      expect(tokenPurgedLogs.length).toBe(3);

      const meta0 = JSON.parse(tokenPurgedLogs[0].metadata || '{}');
      expect(meta0.vgsResponseStatus).toBe(404);
      expect(meta0.reason).toBe('token_not_found_in_vgs');
    });

    it('should be idempotent — re-processing same token does nothing', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 204 });

      await processPurgeVCC({ paymentId, tokenType: 'number', attempt: 1 });
      await processPurgeVCC({ paymentId, tokenType: 'number', attempt: 1 });

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment!.vccToken).toBeNull();

      const auditLogs = await prisma.vCCAuditLog.findMany({
        where: { paymentId, action: 'token_purged', metadata: { contains: '"tokenType":"number"' } },
      });
      expect(auditLogs.length).toBe(1);
    });

    it('should skip already fully purged payment', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 204 });

      await prisma.payment.update({
        where: { id: paymentId },
        data: { vccPurgedAt: new Date() },
      });

      await expect(processPurgeVCC({ paymentId, tokenType: 'number', attempt: 1 })).resolves.not.toThrow();
      expect(vgsDeleteToken).not.toHaveBeenCalled();
    });

    it('should throw on VGS 5xx error for retry', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: false, status: 503, error: 'Service Unavailable' });

      await expect(processPurgeVCC({ paymentId, tokenType: 'number', attempt: 1 }))
        .rejects.toThrow('VGS purge failed: 503');

      // Payment tokens should remain intact
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment!.vccToken).not.toBeNull();
    });
  });

  describe('processPurgeVCCProcessor — dispatcher', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('routes the daily scan repeatable job to runDailyVCCPurgeScan', async () => {
      vi.mocked(runDailyVCCPurgeScan).mockResolvedValue({ scanned: 0, enqueued: 0 });

      await processPurgeVCCProcessor({ name: 'daily-vcc-purge-scan', data: {} });

      expect(runDailyVCCPurgeScan).toHaveBeenCalledTimes(1);
      expect(vgsDeleteToken).not.toHaveBeenCalled();
    });

    it('purges all three tokens for a purge-vcc job carrying hotelId/paymentId/bookingId', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 204 });

      await processPurgeVCCProcessor({
        name: 'purge-vcc',
        data: { hotelId: data.hotel.id, paymentId, bookingId },
      });

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.vccToken).toBeNull();
      expect(payment!.vccExpiryToken).toBeNull();
      expect(payment!.vccCVVToken).toBeNull();
      expect(payment!.vccPurgedAt).not.toBeNull();

      const audit = await prisma.vCCAuditLog.findFirst({
        where: { paymentId, action: 'purged' },
      });
      expect(audit).not.toBeNull();
      expect(audit!.hotelId).toBe(data.hotel.id);

      expect(vgsDeleteToken).toHaveBeenCalledTimes(3);
    });

    it('treats VGS 404 as success for every token (idempotent)', async () => {
      vgsDeleteToken.mockResolvedValue({ ok: true, status: 404 });

      await processPurgeVCCProcessor({
        name: 'purge-vcc',
        data: { hotelId: data.hotel.id, paymentId, bookingId },
      });

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.vccToken).toBeNull();
      expect(payment!.vccPurgedAt).not.toBeNull();
      expect(vgsDeleteToken).toHaveBeenCalledTimes(3);
    });

    it('rejects an invalid payload without touching VGS', async () => {
      await processPurgeVCCProcessor({
        name: 'purge-vcc',
        data: { hotelId: data.hotel.id },
      });

      expect(vgsDeleteToken).not.toHaveBeenCalled();
    });
  });
});