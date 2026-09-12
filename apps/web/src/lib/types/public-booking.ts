// --- Public Booking Flow Types ---
// These mirror the payloads of the public booking APIs so the booking UI and the
// confirmation page share a single source of truth.

export interface PublicCancellationPolicy {
  id: string;
  name: string;
  nameAr?: string;
  rules?: string;
}

export interface PublicRoomType {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  capacity: number;
  images: string[];
}

export interface WebPricingBreakdown {
  nightlyRate: number;
  nights: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  bookingFee: number;
  totalAmount: number;
}

export interface AvailableRoom {
  roomType: PublicRoomType;
  availableCount: number;
  nightlyRate: number;
  ratePlanId?: string;
  cancellationPolicy: PublicCancellationPolicy | null;
  maxAdults: number;
  maxChildren: number;
  pricing: WebPricingBreakdown;
}

export interface AvailabilityResponse {
  hotel: { id: string; name: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  availableRooms: AvailableRoom[];
  message?: string;
}

export interface BookingDetails {
  bookingNo: string;
  status: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  adults?: number;
  children?: number;
  totalAmount?: number;
  webTotalAmount?: number;
  webTaxAmount?: number;
  webFeesAmount?: number;
  webDiscountAmount?: number;
  rooms: Array<{
    roomNumber: string;
    roomTypeName?: string;
    nightlyRate: number;
  }>;
  cancellationPolicy?: PublicCancellationPolicy | null;
  createdAt?: string;
}
