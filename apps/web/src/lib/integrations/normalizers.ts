import { z } from 'zod';

// --- Decoupled PMS Ledger: external booking engine injection (AGENTS.md §16) ---
// Each engine pushes a confirmed booking + payment proof; we normalize to a
// canonical shape and persist as a CONFIRMED booking + SUCCEEDED payment ledger.

export const SUPPORTED_ENGINES = ['booking.com', 'expedia', 'website', 'custom'] as const;
export type ExternalEngine = (typeof SUPPORTED_ENGINES)[number];

export interface NormalizedExternalBooking {
  externalRef: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  adults: number;
  children: number;
  checkIn: string;
  checkOut: string;
  rooms: Array<{ roomId: string; nightlyRate?: number }>;
  payment: {
    method: string;
    amount: number;
    currency: string;
    reference?: string;
  };
}

export const externalBookingSchema = z.object({
  externalRef: z.string().min(1, 'externalRef مطلوب'),
  guestName: z.string().optional(),
  guestEmail: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  guestPhone: z.string().optional(),
  adults: z.number().int().positive().default(1),
  children: z.number().int().min(0).default(0),
  checkIn: z.string().min(1, 'checkIn مطلوب'),
  checkOut: z.string().min(1, 'checkOut مطلوب'),
  rooms: z
    .array(
      z.object({
        roomId: z.string().min(1, 'roomId مطلوب'),
        nightlyRate: z.number().positive().optional(),
      })
    )
    .min(1, 'يجب تحديد غرفة واحدة على الأقل'),
  payment: z.object({
    method: z.string().min(1, 'طريقة الدفع مطلوبة'),
    amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    currency: z.string().default('LYD'),
    reference: z.string().optional(),
  }),
});

// Best-effort field picker for OTA payloads. Real booking.com/expedia payload
// samples MUST be confirmed by the Tech Lead before going live.
function pick(value: any, keys: string[]): any {
  if (!value) return undefined;
  for (const k of keys) {
    const v = value[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function mapExternal(
  body: any,
  refKeys: string[],
  guestObj: any,
  nameKeys: string[],
  emailKeys: string[],
  phoneKeys: string[],
  checkInKeys: string[],
  checkOutKeys: string[],
  adultsKeys: string[],
  childrenKeys: string[],
  roomsObj: any,
  paymentObj: any
): NormalizedExternalBooking {
  const guest = pick(body, [guestObj]) || {};
  const rooms = Array.isArray(pick(body, [roomsObj])) ? pick(body, [roomsObj]) : [];
  const payment = pick(body, [paymentObj]) || {};

  return {
    externalRef: String(pick(body, refKeys) ?? ''),
    guestName: pick(guest, nameKeys),
    guestEmail: pick(guest, emailKeys),
    guestPhone: pick(guest, phoneKeys),
    adults: Number(pick(body, adultsKeys) ?? 1),
    children: Number(pick(body, childrenKeys) ?? 0),
    checkIn: String(pick(body, checkInKeys) ?? ''),
    checkOut: String(pick(body, checkOutKeys) ?? ''),
    rooms: rooms.map((r: any) => ({
      roomId: String(pick(r, ['room_id', 'roomId', 'id']) ?? ''),
      nightlyRate: pick(r, ['nightly_rate', 'nightlyRate', 'price'])
        ? Number(pick(r, ['nightly_rate', 'nightlyRate', 'price']))
        : undefined,
    })),
    payment: {
      method: String(pick(payment, ['method', 'payment_method', 'paymentMethod']) ?? 'CASH').toUpperCase(),
      amount: Number(pick(payment, ['amount', 'total_paid', 'paid_amount']) ?? 0),
      currency: String(pick(payment, ['currency']) ?? 'LYD'),
      reference: pick(payment, ['reference', 'transaction_id', 'transactionId']),
    },
  };
}

// --- Per-engine normalizers ---

function normalizeBookingCom(body: any): NormalizedExternalBooking {
  const reservation = body.reservation || body.booking || body;
  return mapExternal(
    reservation,
    ['reservation_number', 'reservationNo', 'confirmation_number', 'id'],
    'guest',
    ['name', 'full_name', 'guestName'],
    ['email', 'guestEmail'],
    ['phone', 'phone_number', 'guestPhone'],
    ['arrival_date', 'check_in', 'checkIn', 'arrival'],
    ['departure_date', 'check_out', 'checkOut', 'departure'],
    ['adults'],
    ['children', 'child_count'],
    'rooms',
    'payment'
  );
}

function normalizeExpedia(body: any): NormalizedExternalBooking {
  const itinerary = body.itinerary || body.hotelConfirmation || body;
  return mapExternal(
    itinerary,
    ['itinerary_id', 'confirmation_number', 'itineraryId', 'id'],
    'guestInfo',
    ['guestFirstName', 'guestLastName', 'name', 'guestName'],
    ['email', 'guestEmail'],
    ['phone', 'guestPhone'],
    ['checkIn', 'checkin', 'arrival_date', 'startDate'],
    ['checkOut', 'checkout', 'departure_date', 'endDate'],
    ['adults', 'adultCount'],
    ['children', 'childCount'],
    'rooms',
    'payment'
  );
}

function normalizeCanonical(body: any): NormalizedExternalBooking {
  return body;
}

export function normalizeExternalBooking(engine: string, body: any): NormalizedExternalBooking {
  let raw: NormalizedExternalBooking;
  switch (engine) {
    case 'booking.com':
      raw = normalizeBookingCom(body);
      break;
    case 'expedia':
      raw = normalizeExpedia(body);
      break;
    case 'website':
    case 'custom':
      raw = normalizeCanonical(body);
      break;
    default:
      throw new Error('محرك غير معروف');
  }

  const parsed = externalBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message || 'بيانات الحجز غير صالحة');
  }
  return parsed.data as NormalizedExternalBooking;
}
