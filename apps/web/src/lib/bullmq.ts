import { Queue, JobsOptions } from 'bullmq';
import { getRedis } from './redis';

export const PREFIX = process.env.BULLMQ_PREFIX || 'hm';

export interface QueueConfig {
  key: string;
  name: string;
  concurrency: number;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600, count: 1000 },
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.2 },
};

/**
 * M9 — dead-letter queue. Every production queue dies forward into `cm-dlq`
 * (one unified DLQ, not one per queue) so Bull Board surfaces a single
 * "dead letters" surface and replay is one resend away.
 */
export const DLQ_QUEUE_CONFIG: QueueConfig = {
  key: 'dlq',
  name: 'cm-dlq',
  concurrency: getConcurrency('dlq', 1),
};

export function createQueue(config: QueueConfig): Queue {
  return new Queue(config.name, {
    connection: getRedis(),
    prefix: PREFIX,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS },
  });
}

export function getConcurrency(key: string, defaultValue: number): number {
  const raw = process.env[`WORKER_CONCURRENCY_${key.toUpperCase()}`];
  const n = parseInt(raw || '', 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export const QUEUE_CONFIGS: QueueConfig[] = [
  { key: 'snapshot', name: 'cm-availability-snapshot', concurrency: getConcurrency('snapshot', 2) },
  { key: 'publish', name: 'cm-availability-publish', concurrency: getConcurrency('publish', 1) },
  { key: 'ingest', name: 'cm-booking-ingest', concurrency: getConcurrency('ingest', 3) },
  { key: 'rates', name: 'cm-rates-push', concurrency: getConcurrency('rates', 1) },
  { key: 'reconcile', name: 'cm-inventory-reconcile', concurrency: getConcurrency('reconcile', 1) },
  { key: 'purge', name: 'cm-vcc-purge', concurrency: getConcurrency('purge', 2) },
  { key: 'webhook', name: 'cm-webhook-delivery', concurrency: getConcurrency('webhook', 1) },
  DLQ_QUEUE_CONFIG,
];

export const JOB_PRIORITY = {
  CRITICAL: 30,
  HIGH: 20,
  NORMAL: 10,
  LOW: 5,
} as const;

export function buildJobId(parts: (string | number)[]): string {
  return parts.join(':');
}