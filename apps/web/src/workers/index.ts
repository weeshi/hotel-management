import { Worker } from 'bullmq';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { connectRedis, disconnectRedis, getRedis } from '@/lib/redis';
import { registerRepeatableJobs, getQueueHealth, QueueKey } from './queue';
import { QUEUE_CONFIGS } from '@/lib/bullmq';
import { buildSnapshotProcessor } from './jobs/buildSnapshot.job';
import { pushToOTAProcessor } from './jobs/pushToOTA.job';
import { processInboundBookingProcessor } from './jobs/processInboundBooking.job';
import { pushRatePlanProcessor } from './jobs/pushRatePlan.job';
import { reconcileInventoryProcessor } from './jobs/reconcileInventory.job';

const PROCESSORS: Record<QueueKey, (job: any) => Promise<any>> = {
  snapshot: buildSnapshotProcessor,
  publish: pushToOTAProcessor,
  ingest: processInboundBookingProcessor,
  rates: pushRatePlanProcessor,
  reconcile: reconcileInventoryProcessor,
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
  }).listen(port, () => console.log(`[Worker] Health server listening on :${port}`));
}

async function main() {
  const port = parseInt(process.env.PORT || '3001', 10);
  const targets: QueueKey[] = ['snapshot', 'publish', 'ingest', 'rates', 'reconcile'];

  console.log(`[Worker] Starting worker | NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Worker] Consuming queues: ${targets.join(', ')}`);

  await connectRedis();
  await registerRepeatableJobs();
  startHealthServer(port);

  const workers = targets.map((key) => {
    const config = QUEUE_CONFIGS.find((c) => c.key === key)!;
    const worker = new Worker(config.name, PROCESSORS[key], {
      connection: getRedis(),
      concurrency: config.concurrency,
    });

    worker.on('completed', (job) => console.log(`[${config.name}] Job ${job.id} completed`));
    worker.on('failed', (job, err) =>
      console.error(`[${config.name}] Job ${job?.id} failed: ${err.message}`)
    );
    worker.on('error', (err) => console.error(`[${config.name}] Worker error: ${err.message}`));

    return worker;
  });

  const shutdown = async (signal: string) => {
    console.log(`[Worker] ${signal} received, shutting down...`);
    await Promise.all(workers.map((w) => w.close()));
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log('[Worker] All workers started successfully');
}

main().catch((e) => {
  console.error('[Worker] Fatal error:', e);
  process.exit(1);
});