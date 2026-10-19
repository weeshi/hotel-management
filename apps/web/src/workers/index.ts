import { Worker } from 'bullmq';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { connectRedis, disconnectRedis, getRedis } from '@/lib/redis';
import { registerRepeatableJobs, getQueueHealth, moveToDlq, queues, QueueKey } from './queue';
import { QUEUE_CONFIGS } from '@/lib/bullmq';
import { withTenantJob } from '@/lib/tenant/with-tenant-job';
import { buildSnapshotProcessor } from './jobs/buildSnapshot.job';
import { pushToOTAProcessor } from './jobs/pushToOTA.job';
import { processInboundBookingProcessor } from './jobs/processInboundBooking.job';
import { pushRatePlanProcessor } from './jobs/pushRatePlan.job';
import { reconcileInventoryProcessor } from './jobs/reconcileInventory.job';
import { processPurgeVCCProcessor } from './jobs/purgeVCC.job';
import { webhookDeliveryProcessor } from './jobs/webhookDelivery.job';
import { childLogger } from '@/lib/observability/logger';

const log = childLogger({ component: 'worker' });

/**
 * M8 — every job processor runs under an RLS context via {@link withTenantJob}:
 *   - jobs addressed to ONE hotel (`job.data.hotelId`) run as app_tenant for it,
 *   - cross-hotel aggregator/global jobs (e.g. a multi-hotel snapshot/reconcile
 *     or the platform-wide VCC purge scan) run as app_platform BYPASSRLS;
 *     they are trusted internal code and always write tenant attribution
 *     (`hotelId`) explicitly per row.
 * M9 — `webhook` consumes outbound webhook deliveries; `dlq` is the unified
 * dead-letter queue that never runs a processor (dead letters are inspected and
 * replayed manually from Bull Board).
 */
const PROCESSORS: Record<QueueKey, (job: any) => Promise<any>> = {
  snapshot: withTenantJob(buildSnapshotProcessor),
  publish: withTenantJob(pushToOTAProcessor),
  ingest: withTenantJob(processInboundBookingProcessor),
  rates: withTenantJob(pushRatePlanProcessor),
  reconcile: withTenantJob(reconcileInventoryProcessor),
  purge: withTenantJob(processPurgeVCCProcessor),
  webhook: withTenantJob(webhookDeliveryProcessor),
  dlq: async () => undefined,
};

function startHealthServer(port: number): void {
  createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' || req.url === '/api/health/workers') {
      try {
        const health = await getQueueHealth();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', queues: health, uptime: process.uptime() }));
      } catch (e: any) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: e.message }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }).listen(port, () => log.info(`Health server listening on :${port}`));
}

async function main() {
  const port = parseInt(process.env.PORT || '3001', 10);
  const consumedKeys = QUEUE_CONFIGS.map((c) => c.key as QueueKey).filter((k) => k !== 'dlq');
  const targets: QueueKey[] = consumedKeys;

  log.info(
    `Starting worker | NODE_ENV: ${process.env.NODE_ENV || 'development'} | consuming queues: ${targets.join(', ')}`
  );

  await connectRedis();
  await registerRepeatableJobs();
  startHealthServer(port);

  const workers = targets.map((key) => {
    const config = QUEUE_CONFIGS.find((c) => c.key === key)!;
    const worker = new Worker(config.name, PROCESSORS[key], {
      connection: getRedis(),
      concurrency: config.concurrency,
    });

    const qLog = childLogger({ component: 'worker', queue: config.name });
    worker.on('completed', (job) => qLog.info({ jobId: job?.id }, 'job completed'));
    worker.on('failed', async (job, err) => {
      qLog.error({ jobId: job?.id, error: err.message }, 'job failed');
      if (job) {
        const maxAttempts = job.opts?.attempts ?? 1;
        if (job.attemptsMade >= maxAttempts) {
          try {
            await moveToDlq(config.name, job, err);
            qLog.warn({ jobId: job.id, dlq: queues.dlq.name }, 'moved to DLQ');
          } catch (dlqErr: any) {
            qLog.error({ error: dlqErr.message }, 'failed moving job to DLQ');
          }
        }
      }
    });
    worker.on('error', (err) => qLog.error({ error: err.message }, 'worker error'));

    return worker;
  });

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    await Promise.all(workers.map((w) => w.close()));
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  log.info('All workers started successfully');
}

main().catch((e) => {
  log.error({ error: e }, 'Fatal worker error');
  process.exit(1);
});