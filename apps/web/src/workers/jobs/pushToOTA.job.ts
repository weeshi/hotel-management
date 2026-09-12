import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { queues, formatLocalDate } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';
import { getRedis } from '@/lib/redis';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000; // 1 minute base

interface PushToOTAData {
  hotelId: string;
  provider: string;
  roomTypeId: string;
  date: string; // YYYY-MM-DD (local)
  attempt?: number;
}

interface PushResult {
  ok: boolean;
  status?: number;
  responseBody?: string;
  retryAfterMs?: number;
}

/**
 * Processor for `pushToOTA` job.
 * Reads the snapshot from ChannelPriceSnapshot, resolves the channel mapping,
 * builds the provider-specific payload, and calls the OTA endpoint.
 * Implements bucket-per-date to prevent duplicate pushes, and honors Retry-After header.
 */
export async function pushToOTAProcessor(job: Job<PushToOTAData>): Promise<PushResult> {
  const { hotelId, provider, roomTypeId, date, attempt = 1 } = job.data;
  const jobId = job.id || `push:${hotelId}:${provider}:${roomTypeId}:${date}`;

  console.log(`[pushToOTA] ${jobId} attempt=${attempt}/${MAX_ATTEMPTS}`);

  // Bucket key to prevent duplicate pushes for the same date/hotel/provider/roomType
  const redis = getRedis();
  const bucketKey = `ota_push_bucket:${hotelId}:${provider}:${roomTypeId}:${date}`;
  const bucketExists = await redis.get(bucketKey);
  if (bucketExists) {
    console.log(`[pushToOTA] ${jobId} skipped — already pushed (bucket exists)`);
    return { ok: true, status: 200 };
  }

  // Fetch the snapshot for this date
  const snap = await prisma.channelPriceSnapshot.findUnique({
    where: {
      hotelId_provider_roomTypeId_date: {
        hotelId,
        provider: provider as any,
        roomTypeId,
        date: new Date(date + 'T00:00:00'),
      },
    },
    include: {
      roomType: {
        include: {
          ratePlans: { where: { isActive: true }, take: 1 },
        },
      },
    },
  });

  if (!snap) {
    console.warn(`[pushToOTA] ${jobId} no snapshot found`);
    return { ok: false, status: 404, responseBody: 'Snapshot not found' };
  }

  // Fetch the channel mapping to get OTA's room type ID and rate plan ID
  const mapping = await prisma.channelMapping.findFirst({
    where: {
      hotelId,
      provider: provider as any,
      roomTypeId,
      enabled: true,
    },
    select: {
      channelRoomTypeId: true,
      channelRatePlanId: true,
      channelName: true,
    },
  });

  if (!mapping) {
    console.warn(`[pushToOTA] ${jobId} no enabled channel mapping`);
    return { ok: false, status: 400, responseBody: 'No enabled channel mapping' };
  }

  // Build provider-specific payload
  const payload = buildPayload(provider, snap, mapping);

  // Determine endpoint URL (would come from hotel settings / env in real impl)
  const endpoint = getEndpoint(provider, hotelId);
  if (!endpoint) {
    console.error(`[pushToOTA] ${jobId} no endpoint configured for provider ${provider}`);
    return { ok: false, status: 500, responseBody: 'Endpoint not configured' };
  }

  const headers = getHeaders(provider, hotelId);

  // Execute HTTP request with timeout
  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout
    response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[pushToOTA] ${jobId} timeout after 30s`);
      return handleRetry(job, attempt, { ok: false, status: 504, responseBody: 'Timeout' });
    }
    console.error(`[pushToOTA] ${jobId} fetch error:`, err);
    return handleRetry(job, attempt, { ok: false, status: 502, responseBody: String(err) });
  }

  const responseText = await response.text();

  if (response.status === 200 || response.status === 201 || response.status === 202) {
    // Success — set bucket to prevent re-push (TTL 48h)
    await redis.set(bucketKey, '1', 'EX', 172800);
    console.log(`[pushToOTA] ${jobId} success ${response.status}`);
    return { ok: true, status: response.status, responseBody: responseText };
  }

  if (response.status === 429 || response.status === 503) {
    // Rate limited — honor Retry-After header
    const retryAfter = response.headers.get('Retry-After');
    let retryAfterMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
    if (retryAfter) {
      const parsed = parseRetryAfter(retryAfter);
      if (parsed > 0) retryAfterMs = Math.min(parsed, 3600_000); // cap at 1h
    }
    console.warn(`[pushToOTA] ${jobId} rate limited ${response.status}, retryAfter=${retryAfterMs}ms`);
    return handleRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText, retryAfterMs });
  }

  if (response.status >= 400 && response.status < 500) {
    // 4xx = fatal error (bad request, auth, not found) — do NOT retry
    console.error(`[pushToOTA] ${jobId} fatal ${response.status}:`, responseText);
    // Mark bucket as failed to prevent re-processing
    await redis.set(`${bucketKey}:failed`, responseText, 'EX', 86400);
    return { ok: false, status: response.status, responseBody: responseText };
  }

  // 5xx — retry with backoff
  console.warn(`[pushToOTA] ${jobId} server error ${response.status}, retrying`);
  return handleRetry(job, attempt, { ok: false, status: response.status, responseBody: responseText });
}

/**
 * Handle retry logic with exponential backoff or Retry-After
 */
async function handleRetry(
  job: Job<PushToOTAData>,
  attempt: number,
  result: PushResult
): Promise<PushResult> {
  if (attempt >= MAX_ATTEMPTS) {
    console.error(`[pushToOTA] ${job.id} max attempts (${MAX_ATTEMPTS}) reached — moving to DLQ`);
    return { ...result, ok: false };
  }

  const nextAttempt = attempt + 1;
  const delayMs = result.retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1);

  await queues.publish.add(
    'pushToOTA',
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

/**
 * Parse Retry-After header (can be seconds or HTTP-date)
 */
function parseRetryAfter(header: string): number {
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  // Try HTTP-date format
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return 0;
}

/**
 * Build OTA-specific payload from snapshot + mapping
 */
function buildPayload(
  provider: string,
  snap: any,
  mapping: { channelRoomTypeId: string; channelRatePlanId: string | null }
): any {
  const dateStr = formatLocalDate(new Date(snap.date));
  const base = {
    hotel_id: snap.hotelId,
    room_type_id: mapping.channelRoomTypeId,
    date: dateStr,
    availability: Math.max(0, snap.available),
    rate: snap.nightlyRate,
  };

  switch (provider) {
    case 'BOOKING_COM':
      return {
        room_rates: [{
          room_id: mapping.channelRoomTypeId,
          date: dateStr,
          availability: base.availability,
          rate: base.rate,
          ...(mapping.channelRatePlanId ? { rate_plan_id: mapping.channelRatePlanId } : {}),
        }],
      };
    case 'EXPEDIA':
      return {
        availability: [{
          room_type_id: mapping.channelRoomTypeId,
          start_date: dateStr,
          end_date: dateStr,
          available_rooms: base.availability,
          rate: base.rate,
        }],
      };
    case 'AIRBNB':
      return {
        calendar: [{
          listing_id: mapping.channelRoomTypeId,
          date: dateStr,
          available: base.availability > 0,
          price: base.rate,
        }],
      };
    default:
      // Generic fallback
      return base;
  }
}

/**
 * Get endpoint URL for provider (placeholder — would come from hotel integration config)
 */
function getEndpoint(provider: string, hotelId: string): string {
  const baseUrls: Record<string, string> = {
    BOOKING_COM: 'https://supply-xml.booking.com/hotels/availability',
    EXPEDIA: 'https://services.expedia.com/partner/availability',
    AIRBNB: 'https://api.airbnb.com/v2/calendar',
  };
  const url = baseUrls[provider];
  if (!url) return '';
  // In real impl, hotel-specific subdomain/auth would be appended
  return url;
}

/**
 * Get auth headers for provider (placeholder)
 */
function getHeaders(provider: string, hotelId: string): Record<string, string> {
  // In real impl, fetch from IntegrationConfig (encrypted keys)
  switch (provider) {
    case 'BOOKING_COM':
      return { Authorization: `Basic ${process.env.BOOKING_COM_API_KEY || 'placeholder'}` };
    case 'EXPEDIA':
      return { Authorization: `EAN apiKey=${process.env.EXPEDIA_API_KEY || 'placeholder'}` };
    default:
      return {};
  }
}