'use client';

export interface Booking {
  id: string;
  bookingNo: string;
  guestName?: string;
  guestPhone?: string;
  guest?: { id: string; name: string; phone?: string };
  adults?: number;
  children?: number;
  status: string;
  checkIn?: string;
  checkOut?: string;
  rooms: { id: string; checkIn?: string; checkOut?: string; nightlyRate?: number; room: { roomNumber: string } }[];
  folio?: { id: string; balance: number; totalCharges: number; totalPaid: number; status: string };
  bookingServices?: { id: string; serviceId: string; quantity: number; price: number; service: { id: string; name: string; nameAr?: string | null; price: number } }[];
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
