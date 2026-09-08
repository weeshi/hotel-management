export interface GroupBookingData {
  id: string;
  name: string;
  hotelId: string;
  masterFolioId: string | null;
  masterFolio: FolioData | null;
  bookings: BookingData[];
  routingRules: RoutingRuleData[];
  createdAt: string;
  updatedAt: string;
}

export interface FolioData {
  id: string;
  status: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
  transactions?: FolioTransactionData[];
  payments?: PaymentData[];
}

export interface FolioTransactionData {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  createdAt: string;
}

export interface PaymentData {
  id: string;
  amount: number;
  method: string;
  status: string;
}

export interface BookingData {
  id: string;
  bookingNo: string;
  guestName: string | null;
  guest: { id: string; name: string } | null;
  status: string;
  checkIn?: string;
  checkOut?: string;
  folio: FolioData | null;
  rooms: BookingRoomData[];
}

export interface BookingRoomData {
  id: string;
  room: { id: string; roomNumber: string; floor: number | null };
  nightlyRate: number;
  checkIn: string;
  checkOut: string;
}

export interface RoutingRuleData {
  id: string;
  chargeType: string;
  targetFolioId: string;
  targetFolio: FolioData | null;
}
