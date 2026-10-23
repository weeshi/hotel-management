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

export interface GroupReportCategoryBreakdown {
  masterAmount: number;
  subFoliosAmount: number;
  totalAmount: number;
}

export interface GroupReportFolioSummary {
  id: string;
  status: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
}

export interface GroupReportOccupancySummary {
  totalBookings: number;
  cancelledBookings: number;
  statusBreakdown: Record<string, number>;
  totalRooms: number;
  assignedRooms: number;
  unassignedRooms: number;
  totalRoomNights: number;
  totalGuests: { adults: number; children: number };
}

export interface GroupReportMemberBreakdown {
  bookingId: string;
  bookingNo: string;
  guestName: string | null;
  status: string;
  roomNumbers: string[];
  unassignedCount: number;
  nights: number;
  folioId: string | null;
  totalCharges: number;
  totalPaid: number;
  balance: number;
}

export interface GroupReportFinancialSummary {
  masterFolio: GroupReportFolioSummary | null;
  subFoliosTotals: { totalCharges: number; totalPaid: number; balance: number };
  consolidatedTotals: { totalCharges: number; totalPaid: number; balance: number };
  chargesByCategory: Record<string, GroupReportCategoryBreakdown>;
  paymentsByMethod: Record<string, GroupReportCategoryBreakdown>;
}

export interface GroupReportData {
  group: {
    id: string;
    name: string;
    companyName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    notes: string | null;
    createdAt: string;
  };
  occupancySummary: GroupReportOccupancySummary;
  financialSummary: GroupReportFinancialSummary;
  memberBreakdown: GroupReportMemberBreakdown[];
  routingRules: { id: string; chargeType: string; targetFolioId: string }[];
}
