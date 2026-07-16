'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Badge } from '@/components/ui';
import { ItemsList, CloseSafeDepositModal } from '@/components/safe-deposit';

interface BoxDetail {
  id: string; guestName: string; guestIdNumber?: string | null; status: string;
  notes?: string | null; openedAt: string; closedAt?: string | null;
  room: { roomNumber: string; floor: number | null };
  openedBy: { name: string };
  closedBy?: { name: string } | null;
  items: { id: string; description: string; quantity: number; notes: string | null; createdAt: string }[];
}

export default function ReceptionSafeDepositDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [box, setBox] = useState<BoxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClose, setShowClose] = useState(false);

  async function fetchBox() {
    try {
      const res = await fetch(`/api/admin/safe-deposit/${params.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setBox(data.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchBox(); }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!box) {
    return <div className="text-center py-12 text-[var(--text-muted)]">صندوق الأمانات غير موجود</div>;
  }

  const isClosed = box.status === 'CLOSED';

  return (
    <div data-component="ReceptionSafeDepositDetailPage">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">&larr;</button>
        <h1 className="text-2xl font-bold">🔐 صندوق الأمانات</h1>
        <Badge variant={isClosed ? 'green' : 'gold'}>{isClosed ? 'مغلق' : 'نشط'}</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="!p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">معلومات النزيل</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الاسم:</span><span className="font-medium">{box.guestName}</span></div>
            {box.guestIdNumber && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">رقم الهوية:</span><span>{box.guestIdNumber}</span></div>}
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الغرفة:</span><span>{box.room.roomNumber}{box.room.floor ? ` (ط${box.room.floor})` : ''}</span></div>
          </div>
        </Card>

        <Card className="!p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">التواريخ</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تاريخ الفتح:</span><span>{new Date(box.openedAt).toLocaleString('ar-LY')}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">فتح بواسطة:</span><span>{box.openedBy.name}</span></div>
            {isClosed && box.closedAt && (
              <>
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تاريخ الإغلاق:</span><span>{new Date(box.closedAt).toLocaleString('ar-LY')}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">أغلق بواسطة:</span><span>{box.closedBy?.name || ''}</span></div>
              </>
            )}
          </div>
        </Card>
      </div>

      {box.notes && (
        <Card className="!p-4 mb-6">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">ملاحظات</h3>
          <p className="text-sm">{box.notes}</p>
        </Card>
      )}

      <Card className="!p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">العناصر المودعة ({box.items.length})</h3>
        </div>
        <ItemsList items={box.items} boxId={box.id} isClosed={isClosed} onRefresh={fetchBox} />
      </Card>

      {!isClosed && (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.back()}>رجوع</Button>
          <Button onClick={() => setShowClose(true)}>🔒 إغلاق الصندوق</Button>
        </div>
      )}

      <CloseSafeDepositModal
        open={showClose}
        onClose={() => setShowClose(false)}
        boxId={box.id}
        onSuccess={fetchBox}
      />
    </div>
  );
}
