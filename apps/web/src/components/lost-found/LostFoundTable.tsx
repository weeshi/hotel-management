'use client';

import Link from 'next/link';
import { LostFoundStatusBadge } from './LostFoundStatusBadge';

interface LostItemRow {
  id: string; description: string; locationFound: string; status: string;
  claimedByName?: string | null; createdAt: string;
  room?: { roomNumber: string; floor: number | null } | null;
  foundBy?: { name: string };
}

export function LostFoundTable({ items, basePath }: { items: LostItemRow[]; basePath: string }) {
  if (items.length === 0) {
    return <div className="text-center py-8 text-[var(--text-muted)] text-sm">لا توجد عناصر مفقودة</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
            <th className="text-right p-3">الوصف</th>
            <th className="text-right p-3">مكان العثور</th>
            <th className="text-right p-3">الغرفة</th>
            <th className="text-right p-3">تاريخ التسجيل</th>
            <th className="text-right p-3">الحالة</th>
            <th className="text-right p-3">المستلم</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] transition-colors">
              <td className="p-3 font-medium truncate max-w-[200px]">{item.description}</td>
              <td className="p-3 text-[var(--text-secondary)]">{item.locationFound}</td>
              <td className="p-3">{item.room ? `غ${item.room.roomNumber}${item.room.floor ? ` (ط${item.room.floor})` : ''}` : '—'}</td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">{new Date(item.createdAt).toLocaleDateString('ar-LY')}</td>
              <td className="p-3"><LostFoundStatusBadge status={item.status} /></td>
              <td className="p-3 text-[var(--text-secondary)] text-xs">{item.claimedByName || '—'}</td>
              <td className="p-3">
                <Link href={`${basePath}/${item.id}`} className="text-[var(--gold)] hover:underline text-xs">عرض</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
