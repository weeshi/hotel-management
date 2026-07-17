'use client';

import Link from 'next/link';
import { SafeDepositStatusBadge } from './SafeDepositStatusBadge';

interface BoxItem {
  id: string;
  room: { roomNumber: string; floor: number | null };
  openedBy: { name: string };
  closedBy?: { name: string } | null;
  items: any[];
  status: string;
  openedAt: string;
  closedAt?: string | null;
  guestName: string;
}

interface Props {
  boxes: BoxItem[];
}

export function SafeDepositTable({ boxes }: Props) {
  if (!boxes.length) {
    return <div className="text-center py-12 text-[var(--text-muted)]">لا توجد صناديق أمانات</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">اسم النزيل</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الغرفة</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">الحالة</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">تاريخ الفتح</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">فَتْح بواسطة</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]">عدد العناصر</th>
            <th className="text-right p-3 font-semibold text-[var(--text-muted)]"></th>
          </tr>
        </thead>
        <tbody>
          {boxes.map(box => (
            <tr key={box.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
              <td className="p-3 font-medium">{box.guestName}</td>
              <td className="p-3 text-[var(--text-secondary)]">
                {box.room.roomNumber}{box.room.floor ? ` (ط${box.room.floor})` : ''}
              </td>
              <td className="p-3"><SafeDepositStatusBadge status={box.status} /></td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">
                {new Date(box.openedAt).toLocaleDateString('ar-LY')}
              </td>
              <td className="p-3 text-[var(--text-secondary)]">{box.openedBy.name}</td>
              <td className="p-3 text-[var(--text-secondary)]">{box.items?.length || 0}</td>
              <td className="p-3">
                <Link href={`/admin/safe-deposit/${box.id}`}
                  className="text-[var(--gold)] hover:underline text-xs font-medium">
                  تفاصيل
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
