import { z } from 'zod';

// ============================================================
//  VCC Webhook Normalizer (Post-VGS Tokenization)
// ============================================================
// Handles payloads that have ALREADY passed through VGS proxy.
// All sensitive fields (PAN, CVV, expiry) are replaced with tokens.
// This normalizer extracts tokens and standardizes the shape for our ingestion job.

export type VCCProvider = 'booking.com' | 'expedia' | 'airbnb' | 'agoda' | 'trip' | 'other';

export interface VCCPaymentTokens {
  cardToken: string;        // Tokenized PAN (e.g., tok_visa_abc123)
  expiryToken: string;      // Tokenized expiry (e.g., tok_exp_xyz789)
  cvvToken: string;         // Tokenized CVV (e.g., tok_cvv_uvw012)
  holderName: string;       // Cardholder name (non-sensitive)
}

export interface VCCMetadata {
  vaultId?: string;         // VGS Vault ID
  tokenizedAt?: string;     // ISO timestamp when VGS tokenized
  proxyVersion?: string;    // VGS proxy version
  originalProvider: VCCProvider;
}

export interface NormalizedVCCBooking {
  // Core booking identification
  externalRef: string;
  provider: VCCProvider;
  hotelId?: string;           // Resolved from mapping or payload

  // Guest info
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  adults: number;
  children: number;

  // Stay dates
  checkIn: string;          // YYYY-MM-DD
  checkOut: string;         // YYYY-MM-DD

  // Room/rate mapping (local roomTypeId resolved later via ChannelMapping)
  channelRoomTypeId: string;
  channelRatePlanId?: string | null;

  // VCC Payment tokens (NO PAN/CVV/expiry in plain text)
  payment: {
    amount: number;
    currency: string;
    tokens: VCCPaymentTokens;
  };

  // VGS metadata
  vgsMetadata: VCCMetadata;

  // Booking status from OTA
  status?: string;
}

// Zod schemas for validation
const vccPaymentTokensSchema = z.object({
  cardToken: z.string().min(1, 'cardToken مطلوب').regex(/^tok_[a-z]+_[a-z0-9]+$/, 'صيغة token غير صالحة'),
  expiryToken: z.string().min(1, 'expiryToken مطلوب').regex(/^tok_[a-z]+_[a-z0-9]+$/, 'صيغة token غير صالحة'),
  cvvToken: z.string().min(1, 'cvvToken مطلوب').regex(/^tok_[a-z]+_[a-z0-9]+$/, 'صيغة token غير صالحة'),
  holderName: z.string().min(1, 'holderName مطلوب'),
});

const vccMetadataSchema = z.object({
  vaultId: z.string().optional(),
  tokenizedAt: z.string().datetime({ offset: true }).optional(),
  proxyVersion: z.string().optional(),
  originalProvider: z.enum(['booking.com', 'expedia', 'airbnb', 'agoda', 'trip', 'other']),
});

export const normalizedVCCBookingSchema = z.object({
  externalRef: z.string().min(1, 'externalRef مطلوب'),
  provider: z.enum(['booking.com', 'expedia', 'airbnb', 'agoda', 'trip', 'other']),
  hotelId: z.string().optional(),
  guestName: z.string().min(1, 'guestName مطلوب'),
  guestEmail: z.string().email('بريد إلكتروني غير صالح').optional().nullable(),
  guestPhone: z.string().optional().nullable(),
  adults: z.number().int().positive().default(1),
  children: z.number().int().min(0).default(0),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkIn يجب أن يكون YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkOut يجب أن يكون YYYY-MM-DD'),
  channelRoomTypeId: z.string().min(1, 'channelRoomTypeId مطلوب'),
  channelRatePlanId: z.string().optional().nullable(),
  payment: z.object({
    amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    currency: z.string().default('LYD'),
    tokens: vccPaymentTokensSchema,
  }),
  vgsMetadata: vccMetadataSchema,
  status: z.string().optional(),
});

// ============================================================
//  Provider-specific field mappers (pre-VGS payload shape)
// ============================================================

type RawProviderPayload = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pick(value: unknown, keys: string[]): unknown {
  const rec = asRecord(value);
  if (!rec) return undefined;
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function pickString(value: unknown, keys: string[]): string | undefined {
  return asString(pick(value, keys));
}

function toProvider(value: unknown): VCCProvider | undefined {
  const normalized = asString(value)?.toLowerCase();
  return normalized && isValidVCCProvider(normalized) ? normalized : undefined;
}

function normalizeDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const input =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null;
  if (!input || Number.isNaN(input.getTime())) return '';
  return input.toISOString().split('T')[0];
}

function extractBookingComVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  const reservation = asRecord(payload.reservation) ?? asRecord(payload.booking) ?? payload;
  const guest = asRecord(reservation.guest) ?? {};
  const payment = asRecord(reservation.payment) ?? {};

  // Extract tokens from VGS-processed payload
  const tokens: VCCPaymentTokens = {
    cardToken: pickString(payment, ['card_number', 'cardNumber', 'pan', 'token', 'card_token']) ?? '',
    expiryToken: pickString(payment, ['expiry_date', 'expiryDate', 'expiry', 'exp_date', 'exp_token']) ?? '',
    cvvToken: pickString(payment, ['cvv', 'cvc', 'security_code', 'cvv_token']) ?? '',
    holderName: pickString(payment, ['holder_name', 'holderName', 'cardholder_name', 'cardholderName']) ?? '',
  };

  const vgsMeta = asRecord(reservation.vgs_metadata) ?? asRecord(payload.vgs_metadata) ?? {};

  return {
    externalRef: pickString(reservation, ['reservation_number', 'confirmation_number', 'id']) ?? '',
    provider: 'booking.com',
    guestName: pickString(guest, ['name', 'full_name', 'guest_name', 'guestName']) ?? '',
    guestEmail: pickString(guest, ['email', 'guest_email', 'guestEmail']) ?? null,
    guestPhone: pickString(guest, ['phone', 'phone_number', 'guest_phone', 'guestPhone']) ?? null,
    adults: asNumber(pick(reservation, ['adults', 'adult_count', 'guest_count'])) || 1,
    children: asNumber(pick(reservation, ['children', 'child_count', 'childCount'])) || 0,
    checkIn: normalizeDate(pick(reservation, ['arrival_date', 'check_in', 'checkIn', 'arrival'])),
    checkOut: normalizeDate(pick(reservation, ['departure_date', 'check_out', 'checkOut', 'departure'])),
    channelRoomTypeId: pickString(reservation, ['room_type_id', 'roomTypeId', 'room_type', 'room_id']) ?? '',
    channelRatePlanId: pickString(reservation, ['rate_plan_id', 'ratePlanId', 'rate_plan']) ?? null,
    payment: {
      amount: asNumber(pick(payment, ['amount', 'total_amount', 'total', 'price'])) || 0,
      currency: pickString(payment, ['currency', 'curr']) ?? 'EUR',
      tokens,
    },
    vgsMetadata: {
      vaultId: pickString(vgsMeta, ['vault_id', 'vaultId']),
      tokenizedAt: pickString(vgsMeta, ['tokenized_at', 'tokenizedAt']),
      proxyVersion: pickString(vgsMeta, ['proxy_version', 'proxyVersion']),
      originalProvider: 'booking.com',
    },
    status: pickString(reservation, ['status', 'booking_status']),
  };
}

function extractExpediaVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  const itinerary = asRecord(payload.itinerary) ?? asRecord(payload.hotelConfirmation) ?? payload;
  const guest = asRecord(itinerary.guestInfo) ?? {};
  const payment = asRecord(itinerary.payment) ?? {};

  const tokens: VCCPaymentTokens = {
    cardToken: pickString(payment, ['card_number', 'cardNumber', 'pan', 'token']) ?? '',
    expiryToken: pickString(payment, ['expiry_date', 'expiryDate', 'expiry', 'exp_token']) ?? '',
    cvvToken: pickString(payment, ['cvv', 'cvc', 'security_code', 'cvv_token']) ?? '',
    holderName: pickString(payment, ['holder_name', 'holderName', 'cardholder_name']) ?? '',
  };

  const vgsMeta = asRecord(itinerary.vgs_metadata) ?? asRecord(payload.vgs_metadata) ?? {};

  const firstName = pickString(guest, ['guestFirstName', 'first_name']) ?? '';
  const lastName = pickString(guest, ['guestLastName', 'last_name']) ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || pickString(guest, ['name', 'guest_name']) || '';

  return {
    externalRef: pickString(itinerary, ['itinerary_id', 'confirmation_number', 'itineraryId', 'id']) ?? '',
    provider: 'expedia',
    guestName: fullName,
    guestEmail: pickString(guest, ['email', 'guest_email']) ?? null,
    guestPhone: pickString(guest, ['phone', 'guest_phone']) ?? null,
    adults: asNumber(pick(itinerary, ['adults', 'adultCount'])) || 1,
    children: asNumber(pick(itinerary, ['children', 'childCount'])) || 0,
    checkIn: normalizeDate(pick(itinerary, ['checkIn', 'checkin', 'arrival_date', 'startDate'])),
    checkOut: normalizeDate(pick(itinerary, ['checkOut', 'checkout', 'departure_date', 'endDate'])),
    channelRoomTypeId: pickString(itinerary, ['room_type_id', 'roomTypeId', 'room_type']) ?? '',
    channelRatePlanId: pickString(itinerary, ['rate_plan_id', 'ratePlanId']) ?? null,
    payment: {
      amount: asNumber(pick(payment, ['amount', 'total_amount', 'total'])) || 0,
      currency: pickString(payment, ['currency']) ?? 'USD',
      tokens,
    },
    vgsMetadata: {
      vaultId: pickString(vgsMeta, ['vault_id', 'vaultId']),
      tokenizedAt: pickString(vgsMeta, ['tokenized_at', 'tokenizedAt']),
      proxyVersion: pickString(vgsMeta, ['proxy_version', 'proxyVersion']),
      originalProvider: 'expedia',
    },
    status: pickString(itinerary, ['status', 'booking_status']),
  };
}

function extractGenericVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  // Fallback for other providers - assumes VGS already processed
  const payment = asRecord(payload.payment) ?? {};
  const provider = toProvider(pick(payload, ['provider', 'source'])) ?? 'other';

  const tokens: VCCPaymentTokens = {
    cardToken:
      pickString(payload, ['card_token', 'cardToken', 'pan_token']) ??
      pickString(payment, ['card_token', 'cardToken', 'pan_token', 'card_number', 'cardNumber', 'pan']) ??
      '',
    expiryToken:
      pickString(payload, ['expiry_token', 'expiryToken', 'exp_token']) ??
      pickString(payment, ['expiry_token', 'expiryToken', 'exp_token', 'expiry_date', 'expiryDate', 'expiry']) ??
      '',
    cvvToken:
      pickString(payload, ['cvv_token', 'cvvToken', 'cvc_token']) ??
      pickString(payment, ['cvv_token', 'cvvToken', 'cvc_token', 'cvv', 'cvc', 'security_code']) ??
      '',
    holderName:
      pickString(payload, ['holder_name', 'holderName', 'cardholder_name']) ??
      pickString(payment, ['holder_name', 'holderName', 'cardholder_name']) ??
      '',
  };

  const vgsMeta = asRecord(payload.vgs_metadata) ?? asRecord(payment.vgs_metadata) ?? {};

  return {
    externalRef: pickString(payload, ['external_ref', 'externalRef', 'booking_id', 'bookingId', 'id']) ?? '',
    provider,
    guestName: pickString(payload, ['guest_name', 'guestName', 'name']) ?? '',
    guestEmail: pickString(payload, ['guest_email', 'guestEmail', 'email']) ?? null,
    guestPhone: pickString(payload, ['guest_phone', 'guestPhone', 'phone']) ?? null,
    adults: asNumber(pick(payload, ['adults', 'adult_count'])) || 1,
    children: asNumber(pick(payload, ['children', 'child_count'])) || 0,
    checkIn: normalizeDate(pick(payload, ['check_in', 'checkIn', 'arrival_date', 'arrival'])),
    checkOut: normalizeDate(pick(payload, ['check_out', 'checkOut', 'departure_date', 'departure'])),
    channelRoomTypeId: pickString(payload, ['channel_room_type_id', 'channelRoomTypeId', 'room_type_id', 'roomTypeId']) ?? '',
    channelRatePlanId: pickString(payload, ['channel_rate_plan_id', 'channelRatePlanId', 'rate_plan_id']) ?? null,
    payment: {
      amount:
        asNumber(pick(payload, ['amount', 'total_amount', 'price'])) ||
        asNumber(pick(payment, ['amount', 'total_amount', 'price'])) ||
        0,
      currency: pickString(payload, ['currency', 'curr']) ?? pickString(payment, ['currency', 'curr']) ?? 'LYD',
      tokens,
    },
    vgsMetadata: {
      vaultId: pickString(vgsMeta, ['vault_id', 'vaultId']),
      tokenizedAt: pickString(vgsMeta, ['tokenized_at', 'tokenizedAt']),
      proxyVersion: pickString(vgsMeta, ['proxy_version', 'proxyVersion']),
      originalProvider: provider,
    },
    status: pickString(payload, ['status', 'booking_status']),
  };
}

// ============================================================
//  Factory Function
// ============================================================

/**
 * Normalizes a VGS-tokenized webhook payload into our canonical VCC booking shape.
 * @throws Error if validation fails or required tokens are missing
 */
export function normalizeVCCWebhook(provider: string, body: unknown): NormalizedVCCBooking {
  let raw: NormalizedVCCBooking;

  switch (provider.toLowerCase()) {
    case 'booking.com':
      raw = extractBookingComVCC(asRecord(body) ?? {});
      break;
    case 'expedia':
      raw = extractExpediaVCC(asRecord(body) ?? {});
      break;
    case 'airbnb':
    case 'agoda':
    case 'trip':
    case 'other':
    default:
      raw = extractGenericVCC(asRecord(body) ?? {});
      break;
  }

  // Validate with Zod
  const parsed = normalizedVCCBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`VCC webhook validation failed: ${first?.message || 'بيانات غير صالحة'}`);
  }

  return parsed.data as NormalizedVCCBooking;
}

// ============================================================
//  Type Guards & Utilities
// ============================================================

export function isValidVCCProvider(value: string): value is VCCProvider {
  return ['booking.com', 'expedia', 'airbnb', 'agoda', 'trip', 'other'].includes(value.toLowerCase());
}

export function validateVCCPaymentTokens(tokens: VCCPaymentTokens): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tokenRegex = /^tok_[a-z]+_[a-z0-9]+$/;

  if (!tokens.cardToken || !tokenRegex.test(tokens.cardToken)) {
    errors.push('cardToken غير صالح (يجب أن يكون بتنسيق tok_xxx_yyy)');
  }
  if (!tokens.expiryToken || !tokenRegex.test(tokens.expiryToken)) {
    errors.push('expiryToken غير صالح');
  }
  if (!tokens.cvvToken || !tokenRegex.test(tokens.cvvToken)) {
    errors.push('cvvToken غير صالح');
  }
  if (!tokens.holderName || tokens.holderName.trim().length === 0) {
    errors.push('holderName مطلوب');
  }

  return { valid: errors.length === 0, errors };
}