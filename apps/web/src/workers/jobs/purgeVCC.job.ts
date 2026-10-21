import { prisma } from '@/lib/utils/prisma';
import { vgsDeleteToken } from '@/lib/integrations/vgs-client';
import { createAuditLog } from '@/lib/services';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ component: 'worker', queue: 'purge' });

export interface PurgeVCCJobData {
  /** Required for strict TENANT execution via withTenantJob. */
  hotelId?: string;
  paymentId: string;
  bookingId?: string | null;
  /** Omitted → purge all three tokens in one job. */
  tokenType?: TokenType;
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

const TOKEN_TYPES = ['number', 'expiry', 'cvv'] as const;
type TokenType = (typeof TOKEN_TYPES)[number];

async function getTokenField(tokenType: TokenType): Promise<string> {
  switch (tokenType) {
    case 'number':
      return 'vccToken';
    case 'expiry':
      return 'vccExpiryToken';
    case 'cvv':
      return 'vccCVVToken';
  }
}

interface VccTokenFields {
  vccToken: string | null;
  vccExpiryToken: string | null;
  vccCVVToken: string | null;
}

async function getTokenValue(
  payment: VccTokenFields,
  tokenType: TokenType
): Promise<string | null> {
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
  tokenType: TokenType
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
  if (jobData.tokenType) {
    await purgeSingleToken(jobData, jobData.tokenType);
    return;
  }
  for (const tokenType of TOKEN_TYPES) {
    await purgeSingleToken(jobData, tokenType);
  }
}

async function purgeSingleToken(
  jobData: PurgeVCCJobData,
  tokenType: TokenType
): Promise<void> {
  const { paymentId, attempt } = jobData;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });

  if (!payment) {
    log.warn({ paymentId }, 'payment not found — skipping');
    return;
  }

  if (payment.vccPurgedAt) {
    log.info({ paymentId }, 'already fully purged — skipping');
    return;
  }

  const token = await getTokenValue(payment, tokenType);
  if (!token) {
    log.info({ paymentId, tokenType }, 'token already null — skipping');
    return;
  }

  const vaultId = payment.vgsVaultId;
  if (!vaultId) {
    log.error({ paymentId }, 'missing vgsVaultId — cannot purge');
    throw new Error('Missing vgsVaultId');
  }

  log.info({ paymentId, tokenType, attempt, maxAttempts: 10 }, 'purging token');

  const result = await vgsDeleteToken(vaultId, token);

  if (result.ok) {
    await markTokenPurged(paymentId, tokenType);

    const is404 = result.status === 404;

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
          ...(is404 ? { reason: 'token_not_found_in_vgs' } : {}),
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

      log.info({ paymentId }, 'FULLY PURGED');
    }

    return;
  }

  if (result.status === 404) {
    log.info({ paymentId, tokenType }, 'token not found in VGS (404) — treating as purged');
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

  log.error({ paymentId, tokenType, status: result.status, error: result.error }, 'VGS delete failed');
  throw new Error(`VGS purge failed: ${result.status} - ${result.error}`);
}

export interface EnqueuePurgeJobParams {
  hotelId: string;
  paymentId: string;
  bookingId?: string | null;
}

/**
 * Enqueues ONE `purge-vcc` job per payment. The payload always carries
 * `hotelId` so `withTenantJob` runs the child in strict TENANT mode (RLS).
 * A missing `tokenType` means "purge all three tokens" inside the job.
 */
export async function enqueuePurgeJobsForPayment(params: EnqueuePurgeJobParams): Promise<void> {
  const { getQueue } = await import('@/workers/queue');
  const purgeQueue = getQueue('purge');

  await purgeQueue.add(
    'purge-vcc',
    {
      hotelId: params.hotelId,
      paymentId: params.paymentId,
      bookingId: params.bookingId ?? undefined,
      attempt: 1,
    },
    PURGE_JOB_OPTIONS
  );
}

/** Minimal structural shape of a BullMQ job — keeps this processor testable. */
export interface PurgeVCCJob {
  name: string;
  id?: string;
  data: Partial<PurgeVCCJobData>;
}

export async function processPurgeVCCProcessor(job: PurgeVCCJob): Promise<void> {
  // The repeatable scheduler enqueues the cross-tenant scan with an empty
  // payload; it must fan out per-payment jobs, never be treated as a purge.
  if (job.name === 'daily-vcc-purge-scan') {
    const { runDailyVCCPurgeScan } = await import('@/workers/queue');
    await runDailyVCCPurgeScan();
    return;
  }

  const { paymentId, tokenType, attempt } = job.data;
  if (!paymentId) {
    log.error({ jobId: job.id, name: job.name }, 'invalid purge job payload — skipping');
    return;
  }

  return processPurgeVCC({ paymentId, tokenType, attempt: attempt ?? 1 });
}