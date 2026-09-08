'use client';

export interface FolioSummary {
  folioId: string;
  folioNo: string;
  bookingNo: string;
  status: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
  guest: { name: string; email?: string };
  rooms: { number: string; checkIn: string; checkOut: string; nightlyRate: number }[];
  transactions: any[];
  discounts: any[];
  payments: any[];
}

export interface RestaurantOrder {
  id: string;
  orderNo: string;
  totalAmount: number;
  status: string;
  orderType: string;
  tableNo?: string;
  roomNo?: string;
  createdAt: string;
  items: { menuItem: { name: string; nameAr?: string }; quantity: number; price: number }[];
}

export interface Service {
  id: string;
  name: string;
  nameAr?: string;
  price: number;
  category?: { name: string; nameAr?: string };
}
