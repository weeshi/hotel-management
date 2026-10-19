import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';
import { queues } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';
import { normalizeVCCWebhook, NormalizedVCCBooking, validateVCCPaymentTokens } from '@/lib/integrations/vcc-normalizer';
import { VCCAuditLog } from '@prisma/client';
import { childLogger } from '@/lib/observability/logger';

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

  // VCC fields (optional - only present for VCC bookings)
  vccTokens?: {
    cardToken: string;
    expiryToken: string;
    cvvToken: string;
    holderName: string;
  };
  vgsMetadata?: {
    vaultId?: string;
    tokenizedAt?: string;
    proxyVersion?: string;
    originalProvider: string;
  };
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
 * Handles both regular bookings and VCC (Virtual Credit Card) bookings.
 * For VCC bookings: stores tokens securely (PCI-DSS compliant), no PAN/CVV ever touches DB.
 * Priority: CRITICAL (guest-facing booking confirmation).
 */
export async function processInboundBookingProcessor(job: Job<InboundBookingJobData>): Promise<IngestResult> {
  const { hotelId, provider, externalRef, vccTokens, vgsMetadata, ...bookingData } = job.data;
  const jobId = job.id || `ingest:${hotelId}:${provider}:${externalRef}`;
  const log = childLogger({ component: 'worker', queue: 'ingest', jobId, hotelId, provider });

  log.info({ hasVCC: !!vccTokens }, 'inbound booking start');

  const cmService = new ChannelManagerService();

  // If VCC tokens present, validate them first
  if (vccTokens) {
    const validation = validateVCCPaymentTokens(vccTokens);
    if (!validation.valid) {
      log.error({ errors: validation.errors }, 'invalid VCC tokens');
      return { ok: false, status: 400, error: `VCC token validation failed: ${validation.errors.join(', ')}` };
    }
    log.info('VCC tokens validated');
  }

  // Use ChannelManagerService for core ingestion logic
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

  // If VCC tokens present AND booking was created (not duplicate), store VCC data on the payment
  if (vccTokens && vgsMetadata && result.status === 201 && result.body.paymentId) {
    await storeVCCDataOnPayment(
      result.body.paymentId,
      hotelId,
      vccTokens,
      vgsMetadata,
      provider
    );
    // Log audit trail
    await logVCCAudit(hotelId, result.body.paymentId, result.body.bookingId, 'tokenized', {
      provider,
      vgsVaultId: vgsMetadata.vaultId,
    });
  }

  if (result.status === 200 && result.body.duplicate) {
    log.info('duplicate — ignored');
    return { ok: true, status: 200, bookingNo: result.body.bookingNo, duplicate: true };
  }

  if (result.status === 201) {
    log.info({ bookingNo: result.body.bookingNo }, 'created booking');
    return { ok: true, status: 201, bookingNo: result.body.bookingNo, duplicate: false };
  }

  // 4xx errors are logged but not retried (bad data)
  if (result.status && result.status >= 400 && result.status < 500) {
    log.error({ status: result.status, body: result.body }, 'client error');
    return { ok: false, status: result.status, error: result.body?.error };
  }

  // 5xx or unexpected
  log.error({ status: result.status, body: result.body }, 'server error');
  return { ok: false, status: result.status || 500, error: result.body?.error };
}

/**
 * Stores VCC tokens on the Payment record (PCI-DSS compliant).
 * Only tokens are stored — NO PAN, CVV, or expiry in plain text.
 */
async function storeVCCDataOnPayment(
  paymentId: string,
  hotelId: string,
  vccTokens: { cardToken: string; expiryToken: string; cvvToken: string; holderName: string },
  vgsMetadata: { vaultId?: string; tokenizedAt?: string; proxyVersion?: string; originalProvider: string },
  provider: string
): Promise<void> {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      method: 'VCC',
      gateway: 'vgs',
      vccToken: vccTokens.cardToken,
      vccExpiryToken: vccTokens.expiryToken,
      vccCVVToken: vccTokens.cvvToken,
      vccProvider: vgsMetadata.originalProvider || provider,
      vgsVaultId: vgsMetadata.vaultId,
      vccHolderName: vccTokens.holderName,
      metadata: JSON.stringify({
        vccToken: vccTokens.cardToken,
        vccExpiryToken: vccTokens.expiryToken,
        vccCVVToken: vccTokens.cvvToken,
        vccProvider: vgsMetadata.originalProvider || provider,
        vgsVaultId: vgsMetadata.vaultId,
        vccHolderName: vccTokens.holderName,
        tokenizedAt: vgsMetadata.tokenizedAt,
        proxyVersion: vgsMetadata.proxyVersion,
      }),
    },
  });

  childLogger({ component: 'worker', queue: 'ingest', paymentId, hotelId }).info('VCC tokens stored on payment');
}

/**
 * Logs VCC audit trail for PCI-DSS compliance.
 */
async function logVCCAudit(
  hotelId: string,
  paymentId: string,
  bookingId: string | undefined,
  action: string,
  metadata: Record<string, any>
): Promise<void> {
  await prisma.vCCAuditLog.create({
    data: {
      hotelId,
      paymentId,
      bookingId,
      action,
      metadata: JSON.stringify(metadata),
    },
  });
}

/**
 * Alternative entry point: accepts already-normalized VCC booking from webhook route.
 * Used when webhook route does the normalization via VGS proxy.
 */
export async function processNormalizedVCCBooking(
  hotelId: string,
  provider: string,
  normalized: NormalizedVCCBooking
): Promise<IngestResult> {
  const jobId = `ingest:vcc:${hotelId}:${provider}:${normalized.externalRef}`;

  childLogger({ component: 'worker', queue: 'ingest', jobId, hotelId, provider }).info('processing normalized VCC booking');

  // Validate tokens before proceeding
  const validation = validateVCCPaymentTokens(normalized.payment.tokens);
  if (!validation.valid) {
    return { ok: false, status: 400, error: `VCC token validation failed: ${validation.errors.join(', ')}` };
  }

  const cmService = new ChannelManagerService();
  const result = await cmService.ingestInbound(hotelId, provider, {
    externalRef: normalized.externalRef,
    checkIn: normalized.checkIn,
    checkOut: normalized.checkOut,
    channelRoomTypeId: normalized.channelRoomTypeId,
    channelRatePlanId: normalized.channelRatePlanId,
    guestName: normalized.guestName,
    guestEmail: normalized.guestEmail,
    guestPhone: normalized.guestPhone,
    adults: normalized.adults,
    children: normalized.children,
    nightlyRate: normalized.payment.amount, // VCC amount is the nightly rate * nights typically
    paymentAmount: normalized.payment.amount,
    currency: normalized.payment.currency,
    status: normalized.status,
  });

  if (result.status === 201 && result.body.paymentId) {
    await storeVCCDataOnPayment(
      result.body.paymentId,
      hotelId,
      normalized.payment.tokens,
      normalized.vgsMetadata,
      normalized.provider
    );
    await logVCCAudit(hotelId, result.body.paymentId, result.body.bookingId, 'tokenized', {
      provider: normalized.provider,
      vgsVaultId: normalized.vgsMetadata.vaultId,
    });
  }

  if (result.status === 200 && result.body.duplicate) {
    return { ok: true, status: 200, bookingNo: result.body.bookingNo, duplicate: true };
  }
  if (result.status === 201) {
    return { ok: true, status: 201, bookingNo: result.body.bookingNo, duplicate: false };
  }

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