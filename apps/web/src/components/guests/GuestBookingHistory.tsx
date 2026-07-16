'use client';

import Link from 'next/link';

interface BookingBrief {
  id: string;
  bookingNo: string;
  checkIn: string;
  checkOut: string;
  status: string;
  rooms: { room: { roomNumber: string; floor: number | null } }[];
  folio?: { balance: number; totalCharges: number } | null;
}

interface Props {
  bookings: BookingBrief[];
}

const statusLabels: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  CONFIRMED: 'مؤكد',
  CHECKED_IN: 'نشط',
  CHECKED_OUT: 'تم المغادرة',
  CANCELLED: 'ملغي',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-600',
  CONFIRMED: 'bg-blue-500/10 text-blue-600',
  CHECKED_IN: 'bg-green-500/10 text-green-600',
  CHECKED_OUT: 'bg-gray-500/10 text-gray-500',
  CANCELLED: 'bg-red-500/10 text-red-600',
};

export function GuestBookingHistory({ bookings }: Props) {
  if (!bookings.length) {
    return <div className="text-center py-8 text-[var(--text-muted)] text-sm">لا توجد حجوزات</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
            <th className="text-right p-3">رقم الحجز</th>
            <th className="text-right p-3">تاريخ الدخول</th>
            <th className="text-right p-3">تاريخ الخروج</th>
            <th className="text-right p-3">الغرف</th>
            <th className="text-right p-3">الحالة</th>
            <th className="text-right p-3">إجمالي الفاتورة</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
              <td className="p-3 font-medium">#{b.bookingNo}</td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">{new Date(b.checkIn).toLocaleDateString('ar-LY')}</td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">{new Date(b.checkOut).toLocaleDateString('ar-LY')}</td>
              <td className="p-3 text-[var(--text-secondary)]">{b.rooms.map(r => r.room.roomNumber).join('، ')}</td>
              <td className="p-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[b.status] || 'bg-gray-500/10 text-gray-500'}`}>
                  {statusLabels[b.status] || b.status}
                </span>
              </td>
              <td className="p-3">{b.folio ? `${b.folio.totalCharges} د.ل` : '—'}</td>
              <td className="p-3">
                <Link href={`/reception/bookings/${b.id}`} className="text-[var(--gold)] hover:underline text-xs">عرض</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
