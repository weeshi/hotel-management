import { JobScheduler } from 'bullmq';
import { createQueue, QUEUE_CONFIGS, JOB_PRIORITY, PREFIX, buildJobId } from '@/lib/bullmq';
import { getRedis } from '@/lib/redis';
import { prisma } from '@/lib/utils/prisma';
import { runWithTenant } from '@/lib/tenant/runtime-context';
import { enqueuePurgeJobsForPayment } from '@/workers/jobs/purgeVCC.job';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ component: 'worker', module: 'queues' });

export const queues = {
  snapshot: createQueue(QUEUE_CONFIGS[0]),
  publish: createQueue(QUEUE_CONFIGS[1]),
  ingest: createQueue(QUEUE_CONFIGS[2]),
  rates: createQueue(QUEUE_CONFIGS[3]),
  reconcile: createQueue(QUEUE_CONFIGS[4]),
  purge: createQueue(QUEUE_CONFIGS[5]),
  webhook: createQueue(QUEUE_CONFIGS[6]),
  dlq: createQueue(QUEUE_CONFIGS[7]),
} as const;

export function getQueue(key: QueueKey) {
  return queues[key];
}

export type QueueKey = keyof typeof queues;

export async function registerRepeatableJobs(): Promise<void> {
  const connection = getRedis();

  const snapshotScheduler = new JobScheduler(
    QUEUE_CONFIGS.find((c) => c.key === 'snapshot')!.name,
    { connection, prefix: PREFIX }
  );
  await snapshotScheduler.upsertJobScheduler(
    'daily-snapshot-all',
    { pattern: '0 2 * * *' },
    'daily-build-all',
    {},
    { priority: JOB_PRIORITY.NORMAL, removeOnComplete: { age: 3600, count: 100 } },
    { override: true }
  );

  const reconcileScheduler = new JobScheduler(
    QUEUE_CONFIGS.find((c) => c.key === 'reconcile')!.name,
    { connection, prefix: PREFIX }
  );
  await reconcileScheduler.upsertJobScheduler(
    'daily-reconcile-all',
    { pattern: '0 3 * * *' },
    'daily-reconcile-all',
    {},
    { priority: JOB_PRIORITY.LOW, removeOnComplete: { age: 3600, count: 100 } },
    { override: true }
  );

  // M4 — hourly scan of unconfirmed web bookings (confirmationCutoffHours).
  await reconcileScheduler.upsertJobScheduler(
    'hourly-web-booking-expiry',
    { pattern: '0 * * * *' },
    'hourly-web-booking-expiry',
    {},
    { priority: JOB_PRIORITY.LOW, removeOnComplete: { age: 3600, count: 100 } },
    { override: true }
  );

  const purgeScheduler = new JobScheduler(
    QUEUE_CONFIGS.find((c) => c.key === 'purge')!.name,
    { connection, prefix: PREFIX }
  );
  await purgeScheduler.upsertJobScheduler(
    'daily-vcc-purge-scan',
    { pattern: '0 3 * * *', tz: 'Africa/Tripoli' },
    'daily-vcc-purge-scan',
    {},
    { priority: JOB_PRIORITY.LOW, removeOnComplete: { age: 3600, count: 100 } },
    { override: true }
  );

  log.info('Repeatable jobs registered via JobScheduler: daily-snapshot-all (02:00), daily-reconcile-all (03:00), hourly-web-booking-expiry (hourly), daily-vcc-purge-scan (03:00 Tripoli)');
}

export async function runDailyVCCPurgeScan(): Promise<{ scanned: number; enqueued: number }> {
  return runWithTenant({ mode: 'PLATFORM' }, async () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    cutoffDate.setHours(0, 0, 0, 0);

    const vccPayments = await prisma.payment.findMany({
      where: {
        vccToken: { not: null },
        vccPurgedAt: null,
        method: 'VCC',
        gateway: 'vgs',
        booking: {
          rooms: {
            some: {
              checkOut: { lt: cutoffDate },
            },
          },
        },
      },
      select: { id: true, hotelId: true, bookingId: true },
    });

    let enqueued = 0;
    for (const payment of vccPayments) {
      await enqueuePurgeJobsForPayment({
        hotelId: payment.hotelId,
        paymentId: payment.id,
        bookingId: payment.bookingId,
      });
      enqueued++;
    }

    log.info(
      { scanned: vccPayments.length, enqueued },
      'Purge Scanner scanned expired VCC payments'
    );
    return { scanned: vccPayments.length, enqueued };
  });
}

export { runWebBookingExpiryScan } from '@/lib/services/web-booking-expiry.service';

export async function getQueueHealth(): Promise<
  Record<string, { waiting: number; active: number; failed: number }>
> {
  const out: Record<string, { waiting: number; active: number; failed: number }> = {};
  for (const [key, q] of Object.entries(queues) as Array<[QueueKey, (typeof queues)[QueueKey]]>) {
    const [waiting, active, failed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getFailedCount(),
    ]);
    out[key] = { waiting, active, failed };
  }
  return out;
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function eachDate(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export interface PublishEnqueueResult {
  mappings: number;
  accepted: number;
  skipped: number;
}

/**
 * Producer for the publish flow. Fans out one `pushToOTA` job per
 * (enabled mapping × date) with a deterministic idempotent jobId.
 * Execution stays 100% in the queue — the route returns 202 immediately.
 */
export async function enqueuePublishJobs(params: {
  hotelId: string;
  provider: string;
  from: Date;
  to: Date;
}): Promise<PublishEnqueueResult> {
  const { hotelId, provider, from, to } = params;

  const mappings = await prisma.channelMapping.findMany({
    where: { hotelId, provider: provider as any, enabled: true },
    select: { roomTypeId: true },
  });

  const dates = eachDate(from, to);
  let accepted = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    for (const date of dates) {
      const dateStr = formatLocalDate(date);
      const jobId = buildJobId(['push', hotelId, provider, mapping.roomTypeId, dateStr]);
      await queues.publish.add(
        'pushToOTA',
        { hotelId, provider, roomTypeId: mapping.roomTypeId, date: dateStr },
        { jobId, priority: JOB_PRIORITY.HIGH }
      );
      accepted++;
    }
  }

  return { mappings: mappings.length, accepted, skipped };
}

export interface WebhookDeliveryParams {
  hotelId: string;
  provider: string;
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * M9 — producer for the outbound webhook delivery lane.
 * Idempotent jobId per (hotel × provider × url) so re-delivery attempts do not
 * stack up while a previous job for the same callback is still in flight.
 */
export async function enqueueWebhookDelivery(params: WebhookDeliveryParams): Promise<string> {
  const { hotelId, provider, url, method = 'POST', headers, body } = params;
  const jobId = buildJobId(['webhook', hotelId, provider, url]);
  await queues.webhook.add(
    'webhook-delivery',
    { hotelId, provider, url, method, headers, body },
    { jobId, priority: JOB_PRIORITY.HIGH }
  );
  return jobId;
}

/**
 * M9 — move a finally-failed job to the unified DLQ (`cm-dlq`) preserving the
 * original data, the queue it came from, and the terminal failure detail. The
 * DLQ never runs a processor; dead letters are inspected and replayed manually
 * from Bull Board (matching retry is one `Retry` click away).
 */
export async function moveToDlq(
  origin: string,
  job: { id?: string; name?: string; data?: unknown; attemptsMade?: number },
  err: { message?: string; stack?: string }
): Promise<void> {
  await queues.dlq.add(
    'dead-letter',
    {
      originQueue: origin,
      originalJobId: job.id,
      originalJobName: job.name,
      originalData: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: err.message,
      stacktrace: err.stack,
      failedAt: new Date().toISOString(),
    },
    { removeOnComplete: { age: 7 * 24 * 3600, count: 5000 }, removeOnFail: { age: 30 * 24 * 3600, count: 5000 } }
  );
}