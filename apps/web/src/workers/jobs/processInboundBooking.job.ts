import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';
import { queues } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';

interface InboundBookingJobData {
  hotelId: string;
  provider: string;
  externalRef: string;
  checkIn: string;
  checkOut: string;
  channelRoomTypeId: string;
  channelRatePlanId?: string | null;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  adults?: number;
  children?: number;
  nightlyRate?: number | null;
  paymentAmount?: number | null;
  currency?: string;
  status?: string;
}

interface IngestResult {
  ok: boolean;
  status?: number;
  bookingNo?: string;
  duplicate?: boolean;
  error?: string;
}

/**
 * Processor for `processInboundBooking` job.
 * Converts the idempotent webhook payload into a background job.
 * Uses the existing ChannelManagerService.ingestInbound logic for consistency.
 * Priority: CRITICAL (guest-facing booking confirmation).
 */
export async function processInboundBookingProcessor(job: Job<InboundBookingJobData>): Promise<IngestResult> {
  const { hotelId, provider, externalRef, ...bookingData } = job.data;
  const jobId = job.id || `ingest:${hotelId}:${provider}:${externalRef}`;

  console.log(`[processInboundBooking] ${jobId} start`);

  // Fast-path idempotency check via unique constraint (handled inside service)
  const cmService = new ChannelManagerService();
  const result = await cmService.ingestInbound(hotelId, provider, {
    externalRef,
    checkIn: bookingData.checkIn,
    checkOut: bookingData.checkOut,
    channelRoomTypeId: bookingData.channelRoomTypeId,
    channelRatePlanId: bookingData.channelRatePlanId,
    guestName: bookingData.guestName,
    guestEmail: bookingData.guestEmail,
    guestPhone: bookingData.guestPhone,
    adults: bookingData.adults,
    children: bookingData.children,
    nightlyRate: bookingData.nightlyRate,
    paymentAmount: bookingData.paymentAmount,
    currency: bookingData.currency,
    status: bookingData.status,
  });

  if (result.status === 200 && result.body.duplicate) {
    console.log(`[processInboundBooking] ${jobId} duplicate — ignored`);
    return { ok: true, status: 200, bookingNo: result.body.bookingNo, duplicate: true };
  }

  if (result.status === 201) {
    console.log(`[processInboundBooking] ${jobId} created booking ${result.body.bookingNo}`);
    return { ok: true, status: 201, bookingNo: result.body.bookingNo, duplicate: false };
  }

  // 4xx errors are logged but not retried (bad data)
  if (result.status && result.status >= 400 && result.status < 500) {
    console.error(`[processInboundBooking] ${jobId} client error ${result.status}:`, result.body);
    return { ok: false, status: result.status, error: result.body?.error };
  }

  // 5xx or unexpected — could retry but inbound bookings are usually idempotent at webhook level
  console.error(`[processInboundBooking] ${jobId} server error:`, result.body);
  return { ok: false, status: result.status || 500, error: result.body?.error };
}

// Export job options for the producer (webhook route)
export const INGEST_JOB_OPTIONS: JobsOptions = {
  priority: JOB_PRIORITY.CRITICAL,
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 1000 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};