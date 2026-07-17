'use client';

import Link from 'next/link';

interface GuestRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  wallet?: { balance: number } | null;
  _count?: { bookings: number };
}

interface Props {
  guests: GuestRow[];
  basePath: string;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}

export function GuestsTable({ guests, basePath, showDelete, onDelete }: Props) {
  if (!guests.length) {
    return <div className="text-center py-12 text-[var(--text-muted)]">لا يوجد نزلاء</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الاسم</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">البريد</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الهاتف</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الجنسية</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">نقاط الولاء</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">المحفظة</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الحجوزات</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">تاريخ التسجيل</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]"></th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
              <td className="p-3 font-medium">{guest.name}</td>
              <td className="p-3 text-[var(--text-secondary)] text-xs truncate max-w-[160px]">{guest.email || '—'}</td>
              <td className="p-3 text-[var(--text-secondary)]">{guest.phone || '—'}</td>
              <td className="p-3 text-[var(--text-secondary)]">{guest.nationality || '—'}</td>
              <td className="p-3">{guest.loyaltyPoints}</td>
              <td className="p-3 font-medium">{guest.wallet?.balance ?? 0} د.ل</td>
              <td className="p-3 text-[var(--text-secondary)]">{guest._count?.bookings ?? 0}</td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">{new Date(guest.createdAt).toLocaleDateString('ar-LY')}</td>
              <td className="p-3 flex gap-2">
                <Link href={`${basePath}/${guest.id}`} className="text-[var(--gold)] hover:underline text-xs font-medium">عرض</Link>
                {showDelete && onDelete && (
                  <button onClick={() => onDelete(guest.id)} className="text-[var(--red)] hover:underline text-xs">حذف</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
