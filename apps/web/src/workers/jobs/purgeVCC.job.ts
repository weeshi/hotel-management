import { prisma } from '@/lib/utils/prisma';
import { vgsDeleteToken } from '@/lib/integrations/vgs-client';
import { createAuditLog } from '@/lib/services';

export interface PurgeVCCJobData {
  paymentId: string;
  tokenType: 'number' | 'expiry' | 'cvv';
  attempt: number;
}

export const PURGE_JOB_OPTIONS = {
  attempts: 10,
  backoff: {
    type: 'exponential' as const,
    delay: 3600000,
  },
  removeOnFail: { count: 100, age: 86400 },
  removeOnComplete: { count: 1000, age: 86400 },
} as const;

async function getTokenField(tokenType: 'number' | 'expiry' | 'cvv'): Promise<string> {
  switch (tokenType) {
    case 'number':
      return 'vccToken';
    case 'expiry':
      return 'vccExpiryToken';
    case 'cvv':
      return 'vccCVVToken';
  }
}

async function getTokenValue(payment: any, tokenType: 'number' | 'expiry' | 'cvv'): Promise<string | null> {
  switch (tokenType) {
    case 'number':
      return payment.vccToken;
    case 'expiry':
      return payment.vccExpiryToken;
    case 'cvv':
      return payment.vccCVVToken;
  }
}

async function markTokenPurged(
  paymentId: string,
  tokenType: 'number' | 'expiry' | 'cvv'
): Promise<void> {
  const field = await getTokenField(tokenType);
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      [field]: null,
    },
  });
}

async function checkAllTokensPurged(paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { vccToken: true, vccExpiryToken: true, vccCVVToken: true },
  });
  return !payment?.vccToken && !payment?.vccExpiryToken && !payment?.vccCVVToken;
}

export async function processPurgeVCC(jobData: PurgeVCCJobData): Promise<void> {
  const { paymentId, tokenType, attempt } = jobData;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });

  if (!payment) {
    console.warn(`[PurgeVCC] Payment ${paymentId} not found — skipping`);
    return;
  }

  if (payment.vccPurgedAt) {
    console.log(`[PurgeVCC] Payment ${paymentId} already fully purged — skipping`);
    return;
  }

  const token = await getTokenValue(payment, tokenType);
  if (!token) {
    console.log(`[PurgeVCC] Payment ${paymentId} token ${tokenType} already null — skipping`);
    return;
  }

  const vaultId = payment.vgsVaultId;
  if (!vaultId) {
    console.error(`[PurgeVCC] Payment ${paymentId} missing vgsVaultId — cannot purge`);
    throw new Error('Missing vgsVaultId');
  }

  console.log(`[PurgeVCC] Attempt ${attempt}/10 — purging ${tokenType} for payment ${paymentId}`);

  const result = await vgsDeleteToken(vaultId, token);

  if (result.ok) {
    await markTokenPurged(paymentId, tokenType);

    await prisma.vCCAuditLog.create({
      data: {
        hotelId: payment.hotelId,
        paymentId: payment.id,
        bookingId: payment.bookingId,
        action: 'token_purged',
        vccTokenRef: token.substring(0, 12) + '...',
        vgsVaultId: vaultId,
        performedBy: 'SYSTEM_PURGE_JOB',
        ipAddress: 'automated',
        userAgent: 'cm-vcc-purge-worker',
        metadata: JSON.stringify({
          tokenType,
          vgsResponseStatus: result.status,
          attempt,
          purgedAt: new Date().toISOString(),
        }),
      },
    });

    const allPurged = await checkAllTokensPurged(paymentId);
    if (allPurged) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { vccPurgedAt: new Date() },
      });

      await prisma.vCCAuditLog.create({
        data: {
          hotelId: payment.hotelId,
          paymentId: payment.id,
          bookingId: payment.bookingId,
          action: 'purged',
          vccTokenRef: 'ALL_TOKENS',
          vgsVaultId: vaultId,
          performedBy: 'SYSTEM_PURGE_JOB',
          ipAddress: 'automated',
          userAgent: 'cm-vcc-purge-worker',
          metadata: JSON.stringify({
            fullyPurged: true,
            purgedAt: new Date().toISOString(),
          }),
        },
      });

      createAuditLog({
        hotelId: payment.hotelId,
        userId: 'SYSTEM_PURGE_JOB',
        action: 'PURGE',
        entity: 'VCC',
        entityId: payment.id,
        newValue: JSON.stringify({ fullyPurged: true }),
        ip: 'automated',
        userAgent: 'cm-vcc-purge-worker',
      });

      console.log(`[PurgeVCC] Payment ${paymentId} FULLY PURGED`);
    }

    return;
  }

  if (result.status === 404) {
    console.log(`[PurgeVCC] Token ${tokenType} not found in VGS (404) — treating as purged`);
    await markTokenPurged(paymentId, tokenType);

    await prisma.vCCAuditLog.create({
      data: {
        hotelId: payment.hotelId,
        paymentId: payment.id,
        bookingId: payment.bookingId,
        action: 'token_purged',
        vccTokenRef: token.substring(0, 12) + '...',
        vgsVaultId: vaultId,
        performedBy: 'SYSTEM_PURGE_JOB',
        ipAddress: 'automated',
        userAgent: 'cm-vcc-purge-worker',
        metadata: JSON.stringify({
          tokenType,
          vgsResponseStatus: 404,
          reason: 'token_not_found_in_vgs',
          attempt,
          purgedAt: new Date().toISOString(),
        }),
      },
    });

    const allPurged = await checkAllTokensPurged(paymentId);
    if (allPurged) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { vccPurgedAt: new Date() },
      });

      await prisma.vCCAuditLog.create({
        data: {
          hotelId: payment.hotelId,
          paymentId: payment.id,
          bookingId: payment.bookingId,
          action: 'purged',
          vccTokenRef: 'ALL_TOKENS',
          vgsVaultId: vaultId,
          performedBy: 'SYSTEM_PURGE_JOB',
          ipAddress: 'automated',
          userAgent: 'cm-vcc-purge-worker',
          metadata: JSON.stringify({
            fullyPurged: true,
            purgedAt: new Date().toISOString(),
          }),
        },
      });

      createAuditLog({
        hotelId: payment.hotelId,
        userId: 'SYSTEM_PURGE_JOB',
        action: 'PURGE',
        entity: 'VCC',
        entityId: payment.id,
        newValue: JSON.stringify({ fullyPurged: true }),
        ip: 'automated',
        userAgent: 'cm-vcc-purge-worker',
      });
    }
    return;
  }

  console.error(`[PurgeVCC] VGS delete failed for payment ${paymentId} token ${tokenType}: ${result.status} - ${result.error}`);
  throw new Error(`VGS purge failed: ${result.status} - ${result.error}`);
}

const TOKEN_TYPES: Array<'number' | 'expiry' | 'cvv'> = ['number', 'expiry', 'cvv'];

export async function enqueuePurgeJobsForPayment(paymentId: string): Promise<void> {
  const { getQueue } = await import('@/workers/queue');
  const purgeQueue = getQueue('purge');

  for (const tokenType of TOKEN_TYPES) {
    await purgeQueue.add(
      'purge-token',
      { paymentId, tokenType, attempt: 1 },
      PURGE_JOB_OPTIONS
    );
  }
}

export async function processPurgeVCCProcessor(job: any): Promise<void> {
  return processPurgeVCC(job.data);
}