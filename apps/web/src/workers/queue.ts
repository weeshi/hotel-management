import { JobScheduler } from 'bullmq';
import { createQueue, QUEUE_CONFIGS, JOB_PRIORITY, PREFIX, buildJobId } from '@/lib/bullmq';
import { getRedis } from '@/lib/redis';
import { prisma } from '@/lib/utils/prisma';

export const queues = {
  snapshot: createQueue(QUEUE_CONFIGS[0]),
  publish: createQueue(QUEUE_CONFIGS[1]),
  ingest: createQueue(QUEUE_CONFIGS[2]),
  rates: createQueue(QUEUE_CONFIGS[3]),
  reconcile: createQueue(QUEUE_CONFIGS[4]),
} as const;

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

  console.log('[Worker] Repeatable jobs registered via JobScheduler: daily-snapshot-all (02:00), daily-reconcile-all (03:00)');
}

export async function getQueueHealth(): Promise<
  Record<string, { waiting: number; active: number; failed: number }>
> {
  const out: Record<string, { waiting: number; active: number; failed: number }> = {};
  for (const [key, q] of Object.entries(queues)) {
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