'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { MenuPanel } from '@/components/pos/MenuPanel';
import { CartPanel } from '@/components/pos/CartPanel';
import { BookingSearchModal } from '@/components/pos/BookingSearchModal';
import { ActiveOrdersPanel } from '@/components/pos/ActiveOrdersPanel';
import { SettlementModal } from '@/components/pos/SettlementModal';
import type { MenuCategory, MenuItem, CartItem, Booking, RestaurantOrder } from '@/components/pos/types';

export default function ReceptionPOSPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'ROOM_SERVICE' | 'TAKEAWAY'>('DINE_IN');
  const [tableNo, setTableNo] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [searchBookings, setSearchBookings] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showBookingSearch, setShowBookingSearch] = useState(false);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [settleOrder, setSettleOrder] = useState<RestaurantOrder | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/restaurant-orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setOrders(data.data);
    } catch {}
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const token = localStorage.getItem('accessToken');
        const headers = { Authorization: `Bearer ${token}` };
        const [catRes, itemRes, orderRes] = await Promise.all([
          fetch('/api/admin/menu-categories', { headers }),
          fetch('/api/admin/menu-items', { headers }),
          fetch('/api/admin/restaurant-orders', { headers }),
        ]);
        const catData = await catRes.json();
        const itemData = await itemRes.json();
        const orderData = await orderRes.json();
        if (catData.success) setCategories(catData.data);
        if (itemData.success) setItems(itemData.data);
        if (orderData.success) setOrders(orderData.data);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }

  async function searchBooking() {
    if (!searchBookings) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/admin/bookings?search=${searchBookings}&status=CHECKED_IN`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setBookings(data.data || []);
    } catch {}
  }

  async function placeOrder() {
    if (cart.length === 0) return;
    setSubmitting(true);
    await getCsrfToken();
    try {
      const body: any = {
        orderType,
        items: cart.map(i => ({ menuItemId: i.id, quantity: i.quantity, notes: i.notes })),
        guestName: guestName || undefined,
        notes: notes || undefined,
      };
      if (orderType === 'DINE_IN') body.tableNo = tableNo || undefined;
      if (orderType === 'ROOM_SERVICE') body.roomNo = roomNo || undefined;
      if (selectedBooking) body.bookingId = selectedBooking.id;

      const res = await fetch('/api/admin/restaurant-orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setOrders(prev => [data.data, ...prev]);
        setCart([]);
        setGuestName('');
        setNotes('');
        setTableNo('');
        setRoomNo('');
        setSelectedBooking(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSettle(orderId: string, method: 'WALLET' | 'CASH' | 'POS') {
    await getCsrfToken();
    const res = await fetch(`/api/admin/restaurant-orders/${orderId}/settle`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json',
        ...csrfHeaders(),
      },
      body: JSON.stringify({ method }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'فشلت تسوية الطلب');
    }
    await fetchOrders();
  }

  function openSettle(order: RestaurantOrder) {
    setSettleOrder(order);
    setShowSettleModal(true);
  }

  return (
    <div data-component="ReceptionPOSPage" className="flex gap-4 h-[calc(100vh-7rem)]">
      <MenuPanel
        categories={categories}
        activeCat={activeCat}
        searchTerm={searchTerm}
        items={items}
        loading={loading}
        onSelectCategory={setActiveCat}
        onSearchChange={setSearchTerm}
        onAddToCart={addToCart}
      />

      <CartPanel
        cart={cart}
        orderType={orderType}
        tableNo={tableNo}
        roomNo={roomNo}
        guestName={guestName}
        selectedBooking={selectedBooking}
        submitting={submitting}
        onOrderTypeChange={setOrderType}
        onTableNoChange={setTableNo}
        onRoomNoChange={setRoomNo}
        onGuestNameChange={setGuestName}
        onUpdateQty={updateQty}
        onPlaceOrder={placeOrder}
        onLinkFolio={() => setShowBookingSearch(true)}
      />

      <BookingSearchModal
        open={showBookingSearch}
        bookings={bookings}
        onSearch={searchBooking}
        onSelect={(b) => setSelectedBooking(b)}
        onClose={() => { setShowBookingSearch(false); setSearchBookings(''); setBookings([]); }}
      />

      <ActiveOrdersPanel
        orders={orders}
        onSettle={openSettle}
      />

      <SettlementModal
        open={showSettleModal}
        order={settleOrder}
        onClose={() => { setShowSettleModal(false); setSettleOrder(null); }}
        onSettle={handleSettle}
      />
    </div>
  );
}
