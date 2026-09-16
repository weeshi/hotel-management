export type Gateway = 'plutu' | 'tlync' | 'bank-transfer' | 'cash';

export type CheckoutStep =
  | 'select-gateway'
  | 'redirecting'
  | 'bank-transfer'
  | 'cash'
  | 'success'
  | 'failed';

export interface PaymentSessionData {
  paymentSessionId: string;
  paymentUrl: string;
  gatewayTransactionId: string;
  amount: number;
  currency: 'LYD';
  expiresAt: string;
}

export interface PublicBookingSummary {
  id: string;
  bookingNo: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  status: string;
  totalAmount: number;
  currency: string;
}

export interface PublicHotelInfo {
  id: string;
  name: string;
  nameAr: string | null;
  currency: string;
  timezone: string;
}

export interface CheckoutContextValue {
  sessionData: PaymentSessionData | null;
  booking: PublicBookingSummary;
  hotel: PublicHotelInfo;
  loading: boolean;
  error: string | null;
  setSessionData: (data: PaymentSessionData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refetch: () => Promise<void>;
}