'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Badge, Modal, EmptyState } from '@/components/ui';

interface Booking {
  id: string;
  bookingNo: string;
  guestName?: string;
  guest?: { name: string; phone?: string };
  status: string;
  rooms: { id: string; room: { roomNumber: string } }[];
}

export default function CheckInPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{ booking: Booking; action: 'checkin' | 'checkout' | 'cancel' } | null>(null);

  async function fetchBookings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bookings?status=CONFIRMED', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setBookings(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBookings(); }, []);

  const filtered = search
    ? bookings.filter(b =>
        (b.guestName || '').includes(search) ||
        b.bookingNo.includes(search) ||
        b.rooms?.some(r => r.room.roomNumber.includes(search))
      )
    : bookings;

  async function handleAction(bookingId: string, action: string) {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.success) {
        setActionModal(null);
        fetchBookings();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🔑 تسجيل الدخول / الخروج</h1>

      <Card className="mb-6">
        <Input
          placeholder="🔍 بحث برقم الحجز أو اسم الضيف أو رقم الغرفة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔑" title="لا توجد حجوزات مؤكدة" description="جميع الحجوزات المؤكدة ستظهر هنا" />
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => {
            const guestName = booking.guestName || booking.guest?.name || 'غير محدد';
            return (
              <div key={booking.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[var(--gold)]">#{booking.bookingNo}</span>
                      <Badge variant="green">مؤكد</Badge>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">{guestName}</span>
                      <span className="text-[var(--text-muted)] mr-3">
                        {booking.rooms?.map(r => r.room.roomNumber).join('، ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setActionModal({ booking, action: 'checkin' })}>
                      🔑 تسجيل دخول
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setActionModal({ booking, action: 'cancel' })}>
                      ❌ إلغاء
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!actionModal} onClose={() => setActionModal(null)} title="تأكيد العملية">
        {actionModal && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {actionModal.action === 'checkin'
                ? 'هل أنت متأكد من تسجيل دخول هذا الضيف؟'
                : actionModal.action === 'checkout'
                ? 'هل أنت متأكد من تسجيل خروج هذا الضيف؟'
                : 'هل أنت متأكد من إلغاء هذا الحجز؟'}
            </p>
            <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
              <div><strong>الحجز:</strong> #{actionModal.booking.bookingNo}</div>
              <div><strong>الضيف:</strong> {actionModal.booking.guestName || actionModal.booking.guest?.name || 'غير محدد'}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setActionModal(null)}>إلغاء</Button>
              <Button
                variant={actionModal.action === 'cancel' ? 'danger' : 'primary'}
                onClick={() => handleAction(actionModal.booking.id, actionModal.action)}
              >
                {actionModal.action === 'checkin' ? '🔑 تأكيد الدخول' :
                 actionModal.action === 'checkout' ? '🧾 تأكيد الخروج' : '❌ تأكيد الإلغاء'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
