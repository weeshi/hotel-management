'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge, Spinner } from '@/components/ui';

interface SafeBoxDetail {
  id: string;
  serialNumber: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  rentalFee: number | null;
  room: { roomNumber: string; floor: number | null } | null;
  booking: { bookingNo: string; guest: { name: string } } | null;
  externalClient: { name: string } | null;
  package: { name: string; price: number } | null;
  openedBy: { name: string };
  closedBy: { name: string } | null;
  items: { id: string; description: string; quantity: number; notes: string | null }[];
}

function statusBadgeVariant(status: string): 'gold' | 'green' | 'red' {
  switch (status) {
    case 'ACTIVE': return 'gold';
    case 'CLOSED': return 'green';
    default: return 'red';
  }
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط',
  CLOSED: 'مغلق',
};

export default function SafeBoxDetailsPage() {
  const params = useParams();
  const [box, setBox] = useState<SafeBoxDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    const token = localStorage.getItem('accessToken');
    fetch(`/api/admin/safe-deposit/${params.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setBox(data.data);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <Spinner />;
  if (!box) return <p className="text-[var(--text-muted)]">صندوق الأمانات غير موجود</p>;

  const clientName = box.booking?.guest?.name || box.externalClient?.name || '—';
  const bookingNo = box.booking?.bookingNo || '—';
  const roomLabel = box.room ? `${box.room.roomNumber}${box.room.floor ? ` (ط${box.room.floor})` : ''}` : '—';

  return (
    <div data-component="SafeBoxDetailsPage" className="max-w-2xl">
      <Link href="/admin/safeboxes" className="text-sm text-[var(--gold)] hover:underline mb-4 inline-block">
        &larr; العودة إلى صناديق الأمانات
      </Link>

      <h1 className="text-2xl font-bold mb-6">🔐 صندوق أمانات #{box.serialNumber}</h1>

      {/* --- Info Cards --- */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">الحالة</p>
          <Badge variant={statusBadgeVariant(box.status)}>
            {statusLabels[box.status] || box.status}
          </Badge>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">العميل</p>
          <p className="font-medium">{clientName}</p>
          <p className="text-xs text-[var(--text-muted)]">{bookingNo}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">الغرفة</p>
          <p className="font-medium">{roomLabel}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">تاريخ الفتح</p>
          <p className="font-medium">{new Date(box.openedAt).toLocaleDateString('ar-LY')}</p>
        </div>
        {box.closedAt && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">تاريخ الإغلاق</p>
            <p className="font-medium">{new Date(box.closedAt).toLocaleDateString('ar-LY')}</p>
          </div>
        )}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">فاتح الصندوق</p>
          <p className="font-medium">{box.openedBy.name}</p>
        </div>
        {box.package && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">الباقة</p>
            <p className="font-medium">{box.package.name}</p>
            {box.rentalFee != null && (
              <p className="text-xs text-[var(--text-muted)]">{Number(box.rentalFee).toLocaleString()} د.ل</p>
            )}
          </div>
        )}
      </div>

      {/* --- Notes --- */}
      {box.notes && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-6">
          <p className="text-xs text-[var(--text-muted)] mb-1">ملاحظات</p>
          <p>{box.notes}</p>
        </div>
      )}

      {/* --- Items --- */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">العناصر المودعة ({box.items.length})</h3>
        {box.items.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">لا توجد عناصر</p>
        ) : (
          <div className="space-y-2">
            {box.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-[var(--bg-card)] rounded-lg">
                <div>
                  <p className="font-medium text-sm">{item.description}</p>
                  {item.notes && <p className="text-xs text-[var(--text-muted)]">{item.notes}</p>}
                </div>
                <Badge variant="gold">x{item.quantity}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
