'use client';

export interface MenuCategory {
  id: string;
  name: string;
  nameAr?: string;
  icon?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  price: number;
  image?: string;
  isActive?: boolean;
  categoryId: string;
  category: { name: string; nameAr?: string };
}

export interface CartItem extends MenuItem {
  quantity: number;
  notes?: string;
}

export interface Booking {
  id: string;
  bookingNo: string;
  guestName: string;
  roomNo?: string;
  folio?: { id: string; balance: number };
}

export interface OrderItem {
  id: string;
  menuItem: { name: string; nameAr?: string };
  quantity: number;
  price: number;
}

export interface RestaurantOrder {
  id: string;
  orderNo: string;
  status: string;
  orderType: string;
  tableNo?: string;
  roomNo?: string;
  totalAmount: number;
  bookingId?: string | null;
  booking?: { id: string; bookingNo: string; guestName?: string } | null;
  items?: OrderItem[];
  createdAt: string;
}
