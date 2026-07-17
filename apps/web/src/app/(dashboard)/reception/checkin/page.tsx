'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, EmptyState } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { BookingCard } from '@/components/checkin/BookingCard';
import { CheckinModal } from '@/components/checkin/CheckinModal';
import { CheckoutModal } from '@/components/checkin/CheckoutModal';
import { CancelModal } from '@/components/checkin/CancelModal';
import { EditBookingModal } from '@/components/checkin/EditBookingModal';
import type { Booking, FolioData } from '@/components/checkin/types';

export default function CheckInOutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBookingId = searchParams.get('bookingId');
  const [tab, setTab] = useState<'checkin' | 'checkout'>('checkin');
  const [highlightBookingId, setHighlightBookingId] = useState(initialBookingId || '');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBooking, setActionBooking] = useState<Booking | null>(null);
  const [actionType, setActionType] = useState<'checkin' | 'checkout' | 'cancel' | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [folioData, setFolioData] = useState<FolioData | null>(null);

  async function fetchBookings() {
    setLoading(true);
    try {
      const status = tab === 'checkin' ? 'CONFIRMED' : 'CHECKED_IN';
      const res = await fetch(`/api/admin/bookings?status=${status}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setBookings(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBookings(); }, [tab]);

  async function fetchFolio(bookingId: string) {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success && data.data.folio) {
        const folioRes = await fetch(`/api/folio/${data.data.folio.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        });
        const folioData = await folioRes.json();
        if (folioData.success) setFolioData(folioData.data);
      }
    } catch {}
  }

  async function fetchWalletBalance(guestId: string): Promise<number | null> {
    try {
      const res = await fetch(`/api/admin/wallet?guestId=${guestId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) return data.data.balance;
    } catch {}
    return null;
  }

  const filtered = search
    ? bookings.filter(b => (b.guestName || '').includes(search) || b.bookingNo.includes(search) || b.rooms?.some(r => r.room.roomNumber.includes(search)))
    : bookings;

  async function handleCheckin(bookingId: string) {
    await getCsrfToken();
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        closeAction();
        fetchBookings();
        router.push(`/reception/folio?bookingId=${bookingId}`);
      }
    } catch {}
  }

  async function handleCheckout(bookingId: string, payment?: { method: string; amount: number }, action?: string) {
    await getCsrfToken();
    try {
      const body: any = {};
      if (payment) body.payment = payment;
      if (action) body.action = action;
      const res = await fetch(`/api/admin/bookings/${bookingId}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        closeAction();
        fetchBookings();
        router.push(`/reception/folio?bookingId=${bookingId}`);
      }
    } catch {}
  }

  async function handleCancel(bookingId: string) {
    await getCsrfToken();
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
      });
      const data = await res.json();
      if (data.success) { closeAction(); fetchBookings(); }
    } catch {}
  }

  function closeAction() {
    setActionBooking(null);
    setActionType(null);
    setFolioData(null);
  }

  function openCheckin(booking: Booking) {
    setActionBooking(booking);
    setActionType('checkin');
  }

  function openCheckout(booking: Booking) {
    setActionBooking(booking);
    setActionType('checkout');
    setFolioData(null);
    fetchFolio(booking.id);
  }

  function openCancel(booking: Booking) {
    setActionBooking(booking);
    setActionType('cancel');
  }

  return (
    <div data-component="CheckInOutPage">
      <h1 className="text-2xl font-bold mb-6">🔑 تسجيل الدخول / الخروج</h1>

      {initialBookingId && (
        <div className="bg-[rgba(46,204,113,0.1)] border border-[var(--green)] text-[var(--green)] text-sm p-3 rounded-lg mb-6">
          ✅ تم إنشاء الحجز بنجاح، يمكنك الآن تسجيل دخول النزيل
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('checkin')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'checkin' ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          🔑 تسجيل دخول
        </button>
        <button onClick={() => setTab('checkout')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'checkout' ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          🧾 تسجيل خروج
        </button>
      </div>

      <Card className="mb-6">
        <Input placeholder="🔍 بحث برقم الحجز أو اسم النزيل أو رقم الغرفة..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={tab === 'checkin' ? '🔑' : '🧾'} title={tab === 'checkin' ? 'لا توجد حجوزات مؤكدة' : 'لا يوجد نزلاء مقيمون'}
          description={tab === 'checkin' ? 'الحجوزات المؤكدة ستظهر هنا' : 'النزلاء المقيمون حالياً سيظهرون هنا'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => (
            <BookingCard key={booking.id} booking={booking} tab={tab} highlight={booking.id === highlightBookingId}
              onCheckin={openCheckin} onCheckout={openCheckout} onCancel={openCancel} onEdit={setEditBooking} />
          ))}
        </div>
      )}

      <CheckinModal open={actionType === 'checkin'} booking={actionBooking} onConfirm={handleCheckin} onClose={closeAction} />
      <CheckoutModal open={actionType === 'checkout'} booking={actionBooking} folioData={folioData}
        onConfirm={handleCheckout} onClose={closeAction} onFetchWallet={fetchWalletBalance} />
      <CancelModal open={actionType === 'cancel'} booking={actionBooking} onConfirm={handleCancel} onClose={closeAction} />
      <EditBookingModal open={!!editBooking} booking={editBooking} onClose={() => setEditBooking(null)} onSaved={fetchBookings} />
    </div>
  );
}
