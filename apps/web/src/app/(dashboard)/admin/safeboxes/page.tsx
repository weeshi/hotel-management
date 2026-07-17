'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { SafeBoxTable, CreateSafeBoxModal } from '@/components/safeboxes';
import { useAuth } from '@/contexts/auth-context';

// --- Types ---

interface SafeBox {
  id: string;
  serialNumber: number;
  status: string;
  openedAt: string;
  room: { roomNumber: string; floor: number | null } | null;
  booking: { bookingNo: string; guest: { name: string } } | null;
  externalClient: { name: string } | null;
  openedBy: { name: string };
  items: any[];
}

// --- Component ---

export default function AdminSafeBoxesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [boxes, setBoxes] = useState<SafeBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const canManagePricing = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  async function fetchBoxes() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const url = filterStatus
        ? `/api/admin/safe-deposit?status=${filterStatus}`
        : '/api/admin/safe-deposit';
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setBoxes(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBoxes();
  }, [filterStatus]);

  return (
    <div data-component="AdminSafeBoxesPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔐 صناديق الأمانات</h1>
        <div className="flex gap-2">
          {canManagePricing && (
            <Button variant="secondary" onClick={() => router.push('/admin/safeboxes/pricing')}>
              ⚙️ إعدادات الأسعار
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}>+ فتح صندوق جديد</Button>
        </div>
      </div>

      {/* --- Status Filter --- */}
      <div className="flex gap-2 mb-4">
        {(['', 'ACTIVE', 'CLOSED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === s
                ? 'bg-[var(--gold)] text-black'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            {s === '' ? 'الكل' : s === 'ACTIVE' ? 'نشط' : 'مغلق'}
          </button>
        ))}
      </div>

      {/* --- Table --- */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
        <SafeBoxTable boxes={boxes} loading={loading} />
      </div>

      {/* --- Create Modal --- */}
      <CreateSafeBoxModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={fetchBoxes}
      />
    </div>
  );
}
