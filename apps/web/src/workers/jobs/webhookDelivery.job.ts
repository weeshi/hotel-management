import { Job, JobsOptions } from 'bullmq';
import { queues } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';
import { checkRateLimit } from '@/lib/rate-limiter';
import { childLogger } from '@/lib/observability/logger';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const RATE_LIMIT_PER_PROVIDER = 60; // deliveries per window
const RATE_LIMIT_WINDOW_SEC = 60;

interface WebhookDeliveryData {
  hotelId: string;
  provider: string;
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  attempt?: number;
}

interface WebhookResult {
  ok: boolean;
  status?: number;
  responseBody?: string;
  retryAfterMs?: number;
}

/**
 * M9 — outbound webhook delivery lane.
 *
 * Consumes `cm-webhook-delivery` jobs produced by {@link enqueueWebhookDelivery}.
 * Each (hotel × provider) pair is rate-limited through the same Redis Lua
 * script used by the HTTP API, so a hostile/careless OTA callback cannot swamp
 * a tenant. 4xx is fatal (no retry — resubmit from Bull Board), 429/5xx retries
 * on jittered exponential backoff, honoring Retry-After when provided.
 *
 * Runs under `withTenantJob`: `job.data.hotelId` scopes every DB read.
 */
export async function webhookDeliveryProcessor(
  job: Job<WebhookDeliveryData>
): Promise<WebhookResult> {
  const { hotelId, provider, url, method = 'POST', headers = {}, body, attempt = 1 } = job.data;
  const log = childLogger({ component: 'worker', queue: 'webhook', jobId: job.id, hotelId, provider });

  log.info({ attempt, url }, 'webhook delivery start');

  const rate = await checkRateLimit(
    `webhook:${hotelId}:${provider}`,
    RATE_LIMIT_PER_PROVIDER,
    RATE_LIMIT_WINDOW_SEC
  );
  if (!rate.allowed) {
    const retryAfterMs = Math.max(1000, (rate.resetAt - Math.floor(Date.now() / 1000)) * 1000);
    log.warn({ retryAfterMs }, 'webhook rate limited');
    return handleRetry(job, attempt, { ok: false, status: 429, responseBody: 'rate limited', retryAfterMs });
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      log.warn('webhook timeout after 30s');
      return handleRetry(job, attempt, { ok: false, status: 504, responseBody: 'Timeout' });
    }
    log.error({ error: err.message }, 'webhook fetch error');
    return handleRetry(job, attempt, { ok: false, status: 502, responseBody: String(err) });
  }

  const responseText = await response.text();

  if (response.status >= 200 && response.status < 300) {
    log.info({ status: response.status }, 'webhook delivered');
    return { ok: true, status: response.status, responseBody: responseText };
  }

  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('Retry-After');
    let retryAfterMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
    if (retryAfter) {
      const parsed = parseRetryAfter(retryAfter);
      if (parsed > 0) retryAfterMs = Math.min(parsed, 3600_000);
    }
    log.warn({ status: response.status, retryAfterMs }, 'webhook retryable status');
    return handleRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText, retryAfterMs });
  }

  if (response.status >= 500) {
    log.warn({ status: response.status }, 'webhook server error, retrying');
    return handleRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText });
  }

  log.error(
    { status: response.status, responseBody: responseText.slice(0, 500) },
    'webhook fatal (4xx) — not retrying'
  );
  return { ok: false, status: response.status, responseBody: responseText };
}

async function handleRetry(
  job: Job<WebhookDeliveryData>,
  attempt: number,
  result: WebhookResult
): Promise<WebhookResult> {
  if (attempt >= MAX_ATTEMPTS) {
    return { ...result, ok: false };
  }

  const nextAttempt = attempt + 1;
  const delayMs = result.retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1);

  await queues.webhook.add(
    'webhook-delivery',
    { ...job.data, attempt: nextAttempt },
    {
      jobId: `${job.id}:retry${nextAttempt}`,
      priority: JOB_PRIORITY.HIGH,
      delay: delayMs,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 1000 },
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BASE_BACKOFF_MS },
    } as JobsOptions
  );

  return { ...result, ok: false };
}

function parseRetryAfter(header: string): number {
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return 0;
}