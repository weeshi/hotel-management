'use client';

import { Badge, Button } from '@/components/ui';
import type { Booking } from './types';

interface Props {
  booking: Booking;
  tab: 'checkin' | 'checkout';
  highlight?: boolean;
  onCheckin: (booking: Booking) => void;
  onCheckout: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onEdit?: (booking: Booking) => void;
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('ar-LY', { day: 'numeric', month: 'short' });
}

export function BookingCard({ booking, tab, highlight, onCheckin, onCheckout, onCancel, onEdit }: Props) {
  const guestName = booking.guestName || booking.guest?.name || 'غير محدد';
  const firstRoom = booking.rooms?.[0];
  const checkIn = firstRoom?.checkIn || booking.checkIn;
  const checkOut = firstRoom?.checkOut || booking.checkOut;

  return (
    <div key={booking.id} className={`bg-[var(--bg-card)] border rounded-xl p-4 ${highlight ? 'border-[var(--gold)] ring-2 ring-[var(--gold)]' : 'border-[var(--border)]'}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-[var(--gold)]">#{booking.bookingNo}</span>
            <Badge variant={booking.status === 'CONFIRMED' ? 'green' : 'gold'}>{booking.status === 'CONFIRMED' ? 'مؤكد' : 'مقيم'}</Badge>
          </div>
          <div className="text-sm">
            <span className="font-semibold">{guestName}</span>
            <span className="text-[var(--text-muted)] mr-3">{booking.rooms?.map(r => r.room.roomNumber).join('، ')}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1 flex gap-3">
            {checkIn && <span>🔑 {formatDate(checkIn)}</span>}
            {checkOut && <span>🚪 {formatDate(checkOut)}</span>}
          </div>
          {booking.folio && tab === 'checkout' && (
            <div className="text-xs text-[var(--gold)] mt-1">الرصيد: {Number(booking.folio.balance).toFixed(2)} د.ل</div>
          )}
        </div>
        <div className="flex gap-2">
          {tab === 'checkin' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onEdit?.(booking)}>✏️ تعديل</Button>
              <Button size="sm" onClick={() => onCheckin(booking)}>🔑 تسجيل دخول</Button>
              <Button size="sm" variant="danger" onClick={() => onCancel(booking)}>❌ إلغاء</Button>
            </>
          )}
          {tab === 'checkout' && (
            <Button size="sm" onClick={() => onCheckout(booking)}>🧾 تسجيل خروج</Button>
          )}
        </div>
      </div>
    </div>
  );
}
