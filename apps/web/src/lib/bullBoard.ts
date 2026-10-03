import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { queues } from '@/workers/queue';

const basePath = '/superadmin/jobs';

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath(basePath);

createBullBoard({
  queues: [
    new BullMQAdapter(queues.snapshot),
    new BullMQAdapter(queues.publish),
    new BullMQAdapter(queues.ingest),
    new BullMQAdapter(queues.rates),
    new BullMQAdapter(queues.reconcile),
    new BullMQAdapter(queues.purge),
    new BullMQAdapter(queues.webhook),
    new BullMQAdapter(queues.dlq),
  ],
  serverAdapter,
});

export const bullApp = new Hono().route(basePath, serverAdapter.registerPlugin());