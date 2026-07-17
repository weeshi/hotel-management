'use client';

export interface Booking {
  id: string;
  bookingNo: string;
  guestName?: string;
  guestPhone?: string;
  guest?: { id: string; name: string; phone?: string };
  status: string;
  checkIn?: string;
  checkOut?: string;
  rooms: { id: string; checkIn?: string; checkOut?: string; room: { roomNumber: string } }[];
  folio?: { id: string; balance: number; totalCharges: number; totalPaid: number; status: string };
}

export interface FolioData {
  folioId: string;
  balance: number;
  totalCharges: number;
  totalPaid: number;
  guest: { name: string; email?: string };
  rooms: { number: string; checkIn: string; checkOut: string; nightlyRate: number }[];
  transactions: any[];
}
