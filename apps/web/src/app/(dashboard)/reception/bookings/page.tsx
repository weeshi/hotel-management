'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Input, Modal, Card, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';

interface Booking {
  id: string;
  bookingNo: string;
  guestName?: string;
  guest?: { name: string };
  status: string;
  createdAt: string;
  rooms: { room: { roomNumber: string } }[];
  folio?: { balance: number };
}

const statusConfig: Record<string, { label: string; variant: 'gold' | 'green' | 'red' | 'blue' | 'yellow' }> = {
  PENDING: { label: 'قيد الانتظار', variant: 'yellow' },
  CONFIRMED: { label: 'مؤكد', variant: 'green' },
  CHECKED_IN: { label: 'تم الدخول', variant: 'blue' },
  CHECKED_OUT: { label: 'تم الخروج', variant: 'gold' },
  CANCELLED: { label: 'ملغي', variant: 'red' },
  NO_SHOW: { label: 'لم يحضر', variant: 'red' },
};

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  async function fetchBookings() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);
      const res = await apiGet(`/api/admin/bookings?${params}`);
      if (res.success) setBookings(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { fetchBookings(); }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📋 الحجوزات</h1>
        <Button onClick={() => router.push('/reception/bookings/new')}>
          + حجز جديد
        </Button>
      </div>

      <Card className="mb-6">
        <div className="mb-4">
          <Input
            placeholder="🔍 بحث برقم الحجز أو اسم النزيل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {s ? statusConfig[s]?.label || s : 'الكل'}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="📅"
          title="لا توجد حجوزات"
          description={searchTerm ? `لا توجد نتائج للبحث عن "${searchTerm}"` : statusFilter ? 'لا توجد حجوزات بهذه الحالة' : 'لم يتم إنشاء أي حجز بعد'}
          action={<Button onClick={() => router.push('/reception/bookings/new')}>إنشاء حجز جديد</Button>}
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const config = statusConfig[booking.status] || { label: booking.status, variant: 'gold' as const };
            const guestName = booking.guestName || booking.guest?.name || 'غير محدد';
            return (
              <div
                key={booking.id}
                onClick={() => setSelectedBooking(booking)}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 transition-all hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-gold)] cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[var(--gold)]">#{booking.bookingNo}</span>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(booking.createdAt).toLocaleDateString('ar-LY')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{guestName}</span>
                  <span className="text-[var(--text-muted)]">
                    {booking.rooms?.map(r => r.room.roomNumber).join('، ') || '—'}
                    {booking.folio && ` | رصيد: ${booking.folio.balance} د.ل`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} title="تفاصيل الحجز" size="lg">
        {selectedBooking && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--text-muted)]">رقم الحجز:</span>
                <span className="mr-2 font-bold text-[var(--gold)]">#{selectedBooking.bookingNo}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">الحالة:</span>
                <span className="mr-2">
                  <Badge variant={statusConfig[selectedBooking.status]?.variant || 'gold'}>
                    {statusConfig[selectedBooking.status]?.label || selectedBooking.status}
                  </Badge>
                </span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">النزيل:</span>
                <span className="mr-2">{selectedBooking.guestName || selectedBooking.guest?.name || 'غير محدد'}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">الغرف:</span>
                <span className="mr-2">{selectedBooking.rooms?.map(r => r.room.roomNumber).join('، ') || '—'}</span>
              </div>
              {selectedBooking.folio && (
    <div data-component="ReceptionBookingsPage">
                  <span className="text-[var(--text-muted)]">الرصيد:</span>
                  <span className="mr-2 font-bold">{selectedBooking.folio.balance} د.ل</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
              {selectedBooking.status === 'CONFIRMED' && (
                <Button size="sm" onClick={() => router.push(`/reception/checkin?bookingId=${selectedBooking.id}`)}>
                  🔑 تسجيل دخول
                </Button>
              )}
              <Button size="sm" onClick={() => router.push(`/reception/folio?bookingId=${selectedBooking.id}`)}>
                💰 عرض الفاتورة
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSelectedBooking(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
