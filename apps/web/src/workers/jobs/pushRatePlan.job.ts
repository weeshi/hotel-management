import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { queues, formatLocalDate } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';
import { getRedis } from '@/lib/redis';
import { childLogger } from '@/lib/observability/logger';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 30_000; // 30s base for rate plans (less aggressive)

interface PushRatePlanData {
  hotelId: string;
  provider: string;
  ratePlanId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  attempt?: number;
}

interface PushRatePlanResult {
  ok: boolean;
  status?: number;
  responseBody?: string;
  retryAfterMs?: number;
}

/**
 * Processor for `pushRatePlan` job.
 * Pushes a RatePlan's nightly rates to an OTA for a date range.
 * Uses the same bucket-per-date pattern as pushToOTA to prevent duplicates.
 * Priority: NORMAL (rate changes are not guest-facing immediate).
 */
export async function pushRatePlanProcessor(job: Job<PushRatePlanData>): Promise<PushRatePlanResult> {
  const { hotelId, provider, ratePlanId, from, to, attempt = 1 } = job.data;
  const jobId = job.id || `rates:${hotelId}:${provider}:${ratePlanId}:${from}:${to}`;
  const log = childLogger({ component: 'worker', queue: 'rates', jobId, hotelId, provider });

  log.info({ attempt, maxAttempts: MAX_ATTEMPTS }, 'pushRatePlan start');

  // Fetch the rate plan
  const ratePlan = await prisma.ratePlan.findUnique({
    where: { id: ratePlanId },
    include: { roomType: true },
  });
  if (!ratePlan || ratePlan.hotelId !== hotelId) {
    log.warn('rate plan not found or hotel mismatch');
    return { ok: false, status: 404, responseBody: 'Rate plan not found' };
  }

  // Find enabled channel mapping for this roomType+provider
  const mapping = await prisma.channelMapping.findFirst({
    where: {
      hotelId,
      provider: provider as any,
      roomTypeId: ratePlan.roomTypeId,
      enabled: true,
    },
    select: { channelRoomTypeId: true, channelRatePlanId: true },
  });
  if (!mapping) {
    log.warn({ roomTypeId: ratePlan.roomTypeId }, 'no enabled channel mapping for roomType');
    return { ok: false, status: 400, responseBody: 'No enabled channel mapping' };
  }

  // Parse date range
  const startDate = new Date(from + 'T00:00:00');
  const endDate = new Date(to + 'T00:00:00');
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    return { ok: false, status: 400, responseBody: 'Invalid date range' };
  }

  const redis = getRedis();
  let allOk = true;
  let lastResult: PushRatePlanResult = { ok: true };

  // Iterate each date in range
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateStr = formatLocalDate(cursor);
    const bucketKey = `ota_rate_bucket:${hotelId}:${provider}:${ratePlanId}:${dateStr}`;

    // Skip if already pushed
    if (await redis.get(bucketKey)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    // Build payload for this date
    const payload = buildRatePlanPayload(provider, ratePlan, mapping, dateStr);
    const endpoint = getRatePlanEndpoint(provider, hotelId);
    const headers = getHeaders(provider, hotelId);

    if (!endpoint) {
      log.error('no endpoint for provider');
      lastResult = { ok: false, status: 500, responseBody: 'Endpoint not configured' };
      allOk = false;
      break;
    }

    // Execute request
    let response: Response;
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 30_000);
      response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastResult = handleRatePlanRetry(job, attempt, { ok: false, status: 504, responseBody: 'Timeout' });
        allOk = false;
        break;
      }
      lastResult = handleRatePlanRetry(job, attempt, { ok: false, status: 502, responseBody: String(err) });
      allOk = false;
      break;
    }

    const responseText = await response.text();

    if ([200, 201, 202].includes(response.status)) {
      await redis.set(bucketKey, '1', 'EX', 172800); // 48h TTL
      log.info({ dateStr, status: response.status }, 'rate plan pushed');
    } else if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get('Retry-After');
      let retryAfterMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      if (retryAfter) { const parsed = parseRetryAfter(retryAfter); if (parsed > 0) retryAfterMs = Math.min(parsed, 3_600_000); }
      lastResult = handleRatePlanRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText, retryAfterMs });
      allOk = false;
      break;
    } else if (response.status >= 400 && response.status < 500) {
      await redis.set(`${bucketKey}:failed`, responseText, 'EX', 86400);
      log.error({ dateStr, status: response.status, responseBody: responseText.slice(0, 500) }, 'fatal (4xx) — not retrying');
      lastResult = { ok: false, status: response.status, responseBody: responseText };
      allOk = false;
      break;
    } else {
      log.warn({ dateStr, status: response.status }, 'server error, retrying');
      lastResult = handleRatePlanRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText });
      allOk = false;
      break;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return allOk ? { ok: true, status: lastResult.status, responseBody: lastResult.responseBody, retryAfterMs: lastResult.retryAfterMs } : lastResult;
}

function handleRatePlanRetry(
  job: Job<PushRatePlanData>,
  attempt: number,
  result: PushRatePlanResult
): PushRatePlanResult {
  if (attempt >= MAX_ATTEMPTS) {
    childLogger({ component: 'worker', queue: 'rates', jobId: job.id }).error('max attempts reached');
    return { ...result, ok: false };
  }
  const delayMs = result.retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  queues.rates.add('pushRatePlan', { ...job.data, attempt: attempt + 1 }, {
    jobId: `${job.id}:retry${attempt + 1}`, priority: JOB_PRIORITY.NORMAL, delay: delayMs,
    removeOnComplete: { age: 3600, count: 100 }, removeOnFail: { age: 86400, count: 1000 },
    attempts: MAX_ATTEMPTS, backoff: { type: 'exponential', delay: BASE_BACKOFF_MS },
  } as JobsOptions);
  return { ...result, ok: false };
}

function parseRetryAfter(header: string): number {
  const sec = parseInt(header, 10); if (!Number.isNaN(sec)) return sec * 1000;
  const d = new Date(header); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, d.getTime() - Date.now());
}

function buildRatePlanPayload(provider: string, ratePlan: any, mapping: any, dateStr: string): any {
  const base = {
    hotel_id: ratePlan.hotelId,
    room_type_id: mapping.channelRoomTypeId,
    rate_plan_id: mapping.channelRatePlanId,
    date: dateStr,
    rate: ratePlan.nightlyRate,
  };
  switch (provider) {
    case 'BOOKING_COM':
      return { rate_plans: [{ rate_plan_id: mapping.channelRatePlanId, date: dateStr, rate: base.rate }] };
    case 'EXPEDIA':
      return { rate_plans: [{ rate_plan_id: mapping.channelRatePlanId, start_date: dateStr, end_date: dateStr, rate: base.rate }] };
    default:
      return base;
  }
}

function getRatePlanEndpoint(provider: string, hotelId: string): string {
  const urls: Record<string, string> = {
    BOOKING_COM: 'https://supply-xml.booking.com/hotels/rates',
    EXPEDIA: 'https://services.expedia.com/partner/rateplans',
  };
  return urls[provider] || '';
}

function getHeaders(provider: string, hotelId: string): Record<string, string> {
  switch (provider) {
    case 'BOOKING_COM': return { Authorization: `Basic ${process.env.BOOKING_COM_API_KEY || 'placeholder'}` };
    case 'EXPEDIA': return { Authorization: `EAN apiKey=${process.env.EXPEDIA_API_KEY || 'placeholder'}` };
    default: return {};
  }
}