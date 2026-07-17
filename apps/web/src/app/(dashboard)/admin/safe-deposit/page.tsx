'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { SafeDepositTable, CreateSafeDepositModal } from '@/components/safe-deposit';

interface RoomOption { id: string; roomNumber: string; floor: number | null }
interface SafeBox {
  id: string; guestName: string; status: string; openedAt: string; closedAt?: string | null;
  room: { roomNumber: string; floor: number | null };
  openedBy: { name: string };
  closedBy?: { name: string } | null;
  items: any[];
}

export default function AdminSafeDepositPage() {
  const [boxes, setBoxes] = useState<SafeBox[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function fetchBoxes() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const url = filterStatus ? `/api/admin/safe-deposit?status=${filterStatus}` : '/api/admin/safe-deposit';
      const [boxesRes, roomsRes] = await Promise.all([
        fetch(url, { headers }),
        fetch('/api/admin/rooms', { headers }),
      ]);
      const bd = await boxesRes.json();
      const rd = await roomsRes.json();
      if (bd.success) setBoxes(bd.data);
      if (rd.success) setRooms(rd.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchBoxes(); }, [filterStatus]);

  return (
    <div data-component="AdminSafeDepositPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔐 صناديق الأمانات</h1>
        <Button onClick={() => setShowCreate(true)}>+ فتح صندوق جديد</Button>
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'ACTIVE', 'CLOSED'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === s
                ? 'bg-[var(--gold)] text-black'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
            }`}>
            {s === '' ? 'الكل' : s === 'ACTIVE' ? 'نشط' : 'مغلق'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
          <SafeDepositTable boxes={boxes} />
        </div>
      )}

      <CreateSafeDepositModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        rooms={rooms}
        onSuccess={fetchBoxes}
      />
    </div>
  );
}
