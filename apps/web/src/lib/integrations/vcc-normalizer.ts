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

interface RawProviderPayload {
  // Booking.com
  reservation_number?: string;
  confirmation_number?: string;
  reservation?: any;
  booking?: any;
  guest?: any;
  rooms?: any[];
  payment?: any;
  virtual_card?: boolean;

  // Expedia
  itinerary_id?: string;
  hotelConfirmation?: any;
  itinerary?: any;
  guestInfo?: any;

  // Generic
  [key: string]: any;
}

function pick(value: any, keys: string[]): any {
  if (!value) return undefined;
  for (const k of keys) {
    const v = value[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function normalizeDate(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function extractBookingComVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  const reservation = payload.reservation || payload.booking || payload;
  const guest = reservation.guest || {};
  const payment = reservation.payment || {};
  const virtualCard = payment.virtual_card || reservation.virtual_card;

  // Extract tokens from VGS-processed payload
  const tokens: VCCPaymentTokens = {
    cardToken: String(pick(payment, ['card_number', 'cardNumber', 'pan', 'token', 'card_token']) || ''),
    expiryToken: String(pick(payment, ['expiry_date', 'expiryDate', 'expiry', 'exp_date', 'exp_token']) || ''),
    cvvToken: String(pick(payment, ['cvv', 'cvc', 'security_code', 'cvv_token']) || ''),
    holderName: String(pick(payment, ['holder_name', 'holderName', 'cardholder_name', 'cardholderName']) || ''),
  };

  const vgsMeta = reservation.vgs_metadata || payload.vgs_metadata || {};

  return {
    externalRef: String(pick(reservation, ['reservation_number', 'confirmation_number', 'id']) || ''),
    provider: 'booking.com',
    guestName: String(pick(guest, ['name', 'full_name', 'guest_name', 'guestName']) || ''),
    guestEmail: pick(guest, ['email', 'guest_email', 'guestEmail']) || null,
    guestPhone: pick(guest, ['phone', 'phone_number', 'guest_phone', 'guestPhone']) || null,
    adults: Number(pick(reservation, ['adults', 'adult_count', 'guest_count']) || 1),
    children: Number(pick(reservation, ['children', 'child_count', 'childCount']) || 0),
    checkIn: normalizeDate(pick(reservation, ['arrival_date', 'check_in', 'checkIn', 'arrival'])),
    checkOut: normalizeDate(pick(reservation, ['departure_date', 'check_out', 'checkOut', 'departure'])),
    channelRoomTypeId: String(pick(reservation, ['room_type_id', 'roomTypeId', 'room_type', 'room_id']) || ''),
    channelRatePlanId: pick(reservation, ['rate_plan_id', 'ratePlanId', 'rate_plan']) || null,
    payment: {
      amount: Number(pick(payment, ['amount', 'total_amount', 'total', 'price']) || 0),
      currency: String(pick(payment, ['currency', 'curr']) || 'EUR'),
      tokens,
    },
    vgsMetadata: {
      vaultId: vgsMeta.vault_id || vgsMeta.vaultId,
      tokenizedAt: vgsMeta.tokenized_at || vgsMeta.tokenizedAt,
      proxyVersion: vgsMeta.proxy_version || vgsMeta.proxyVersion,
      originalProvider: 'booking.com',
    },
    status: pick(reservation, ['status', 'booking_status']),
  };
}

function extractExpediaVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  const itinerary = payload.itinerary || payload.hotelConfirmation || payload;
  const guest = itinerary.guestInfo || {};
  const payment = itinerary.payment || {};

  const tokens: VCCPaymentTokens = {
    cardToken: String(pick(payment, ['card_number', 'cardNumber', 'pan', 'token']) || ''),
    expiryToken: String(pick(payment, ['expiry_date', 'expiryDate', 'expiry', 'exp_token']) || ''),
    cvvToken: String(pick(payment, ['cvv', 'cvc', 'security_code', 'cvv_token']) || ''),
    holderName: String(pick(payment, ['holder_name', 'holderName', 'cardholder_name']) || ''),
  };

  const vgsMeta = itinerary.vgs_metadata || payload.vgs_metadata || {};

  return {
    externalRef: String(pick(itinerary, ['itinerary_id', 'confirmation_number', 'itineraryId', 'id']) || ''),
    provider: 'expedia',
    guestName: String(pick(guest, ['guestFirstName', 'guestLastName', 'name', 'guest_name']) || ''),
    guestEmail: pick(guest, ['email', 'guest_email']) || null,
    guestPhone: pick(guest, ['phone', 'guest_phone']) || null,
    adults: Number(pick(itinerary, ['adults', 'adultCount']) || 1),
    children: Number(pick(itinerary, ['children', 'childCount']) || 0),
    checkIn: normalizeDate(pick(itinerary, ['checkIn', 'checkin', 'arrival_date', 'startDate'])),
    checkOut: normalizeDate(pick(itinerary, ['checkOut', 'checkout', 'departure_date', 'endDate'])),
    channelRoomTypeId: String(pick(itinerary, ['room_type_id', 'roomTypeId', 'room_type']) || ''),
    channelRatePlanId: pick(itinerary, ['rate_plan_id', 'ratePlanId']) || null,
    payment: {
      amount: Number(pick(payment, ['amount', 'total_amount', 'total']) || 0),
      currency: String(pick(payment, ['currency']) || 'USD'),
      tokens,
    },
    vgsMetadata: {
      vaultId: vgsMeta.vault_id || vgsMeta.vaultId,
      tokenizedAt: vgsMeta.tokenized_at || vgsMeta.tokenizedAt,
      proxyVersion: vgsMeta.proxy_version || vgsMeta.proxyVersion,
      originalProvider: 'expedia',
    },
    status: pick(itinerary, ['status', 'booking_status']),
  };
}

function extractGenericVCC(payload: RawProviderPayload): NormalizedVCCBooking {
  // Fallback for other providers - assumes VGS already processed
  const tokens: VCCPaymentTokens = {
    cardToken: String(pick(payload, ['card_token', 'cardToken', 'pan_token']) || ''),
    expiryToken: String(pick(payload, ['expiry_token', 'expiryToken', 'exp_token']) || ''),
    cvvToken: String(pick(payload, ['cvv_token', 'cvvToken', 'cvc_token']) || ''),
    holderName: String(pick(payload, ['holder_name', 'holderName', 'cardholder_name']) || ''),
  };

  const vgsMeta = payload.vgs_metadata || {};

  return {
    externalRef: String(pick(payload, ['external_ref', 'externalRef', 'booking_id', 'bookingId', 'id']) || ''),
    provider: (pick(payload, ['provider', 'source']) as VCCProvider) || 'other',
    guestName: String(pick(payload, ['guest_name', 'guestName', 'name']) || ''),
    guestEmail: pick(payload, ['guest_email', 'guestEmail', 'email']) || null,
    guestPhone: pick(payload, ['guest_phone', 'guestPhone', 'phone']) || null,
    adults: Number(pick(payload, ['adults', 'adult_count']) || 1),
    children: Number(pick(payload, ['children', 'child_count']) || 0),
    checkIn: normalizeDate(pick(payload, ['check_in', 'checkIn', 'arrival_date', 'arrival'])),
    checkOut: normalizeDate(pick(payload, ['check_out', 'checkOut', 'departure_date', 'departure'])),
    channelRoomTypeId: String(pick(payload, ['channel_room_type_id', 'channelRoomTypeId', 'room_type_id', 'roomTypeId']) || ''),
    channelRatePlanId: pick(payload, ['channel_rate_plan_id', 'channelRatePlanId', 'rate_plan_id']) || null,
    payment: {
      amount: Number(pick(payload, ['amount', 'total_amount', 'price']) || 0),
      currency: String(pick(payload, ['currency', 'curr']) || 'LYD'),
      tokens,
    },
    vgsMetadata: {
      vaultId: vgsMeta.vault_id || vgsMeta.vaultId,
      tokenizedAt: vgsMeta.tokenized_at || vgsMeta.tokenizedAt,
      proxyVersion: vgsMeta.proxy_version || vgsMeta.proxyVersion,
      originalProvider: (pick(payload, ['provider', 'source']) as VCCProvider) || 'other',
    },
    status: pick(payload, ['status', 'booking_status']),
  };
}

// ============================================================
//  Factory Function
// ============================================================

/**
 * Normalizes a VGS-tokenized webhook payload into our canonical VCC booking shape.
 * @throws Error if validation fails or required tokens are missing
 */
export function normalizeVCCWebhook(provider: string, body: any): NormalizedVCCBooking {
  let raw: NormalizedVCCBooking;

  switch (provider.toLowerCase()) {
    case 'booking.com':
      raw = extractBookingComVCC(body);
      break;
    case 'expedia':
      raw = extractExpediaVCC(body);
      break;
    case 'airbnb':
    case 'agoda':
    case 'trip':
    case 'other':
    default:
      raw = extractGenericVCC(body);
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