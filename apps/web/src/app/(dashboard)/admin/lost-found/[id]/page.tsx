'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { LostFoundStatusBadge, ClaimLostItemModal, DisposeLostItemModal } from '@/components/lost-found';

interface LostItemDetail {
  id: string; description: string; locationFound: string; status: string;
  imageUrl?: string | null; claimedByName?: string | null;
  claimedByIdNumber?: string | null; claimedAt?: string | null;
  notes?: string | null; createdAt: string;
  room?: { roomNumber: string; floor: number | null } | null;
  foundBy?: { name: string };
}

export default function AdminLostItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<LostItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClaim, setShowClaim] = useState(false);
  const [showDispose, setShowDispose] = useState(false);

  async function fetchItem() {
    try {
      const res = await fetch(`/api/admin/lost-found/${params.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (data.success) setItem(data.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchItem(); }, [params.id]);

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

  if (!item) {
    return <div className="text-center py-12 text-[var(--text-muted)]">الغرض غير موجود</div>;
  }

  return (
    <div data-component="AdminLostItemDetailPage">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">&larr;</button>
        <h1 className="text-2xl font-bold">📦 الغرض المفقود</h1>
        <LostFoundStatusBadge status={item.status} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="!p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">معلومات الغرض</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الوصف:</span><span className="font-medium">{item.description}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">مكان العثور:</span><span>{item.locationFound}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الغرفة:</span><span>{item.room ? `غ${item.room.roomNumber}${item.room.floor ? ` (ط${item.room.floor})` : ''}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تم العثور بواسطة:</span><span>{item.foundBy?.name || '—'}</span></div>
          </div>
        </Card>

        <Card className="!p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">التواريخ</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تاريخ التسجيل:</span><span>{new Date(item.createdAt).toLocaleString('ar-LY')}</span></div>
            {item.claimedAt && (
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">تاريخ الاستلام:</span><span>{new Date(item.claimedAt).toLocaleString('ar-LY')}</span></div>
            )}
          </div>
        </Card>

        {item.status === 'CLAIMED' && (
          <Card className="!p-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">المستلم</h3>
            <div className="space-y-2 text-sm">
              {item.claimedByName && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">الاسم:</span><span className="font-medium">{item.claimedByName}</span></div>}
              {item.claimedByIdNumber && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">رقم الهوية:</span><span>{item.claimedByIdNumber}</span></div>}
            </div>
          </Card>
        )}
      </div>

      {item.imageUrl && (
        <Card className="!p-4 mb-6">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">صورة الغرض</h3>
          <img src={item.imageUrl} alt={item.description} className="max-w-sm rounded-lg" />
        </Card>
      )}

      {item.notes && (
        <Card className="!p-4 mb-6">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">ملاحظات</h3>
          <p className="text-sm">{item.notes}</p>
        </Card>
      )}

      {item.status === 'PENDING' && (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.back()}>رجوع</Button>
          <Button onClick={() => setShowClaim(true)}>📦 تسليم الغرض</Button>
          <Button variant="secondary" onClick={() => setShowDispose(true)}>🗑️ التخلص</Button>
        </div>
      )}

      <ClaimLostItemModal
        open={showClaim}
        onClose={() => setShowClaim(false)}
        itemId={item.id}
        onSuccess={fetchItem}
      />
      <DisposeLostItemModal
        open={showDispose}
        onClose={() => setShowDispose(false)}
        itemId={item.id}
        onSuccess={fetchItem}
      />
    </div>
  );
}
