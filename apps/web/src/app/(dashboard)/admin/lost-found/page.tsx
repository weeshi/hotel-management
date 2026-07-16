'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { LostFoundTable, CreateLostItemModal } from '@/components/lost-found';

interface RoomOption { id: string; roomNumber: string; floor: number | null }
interface LostItem {
  id: string; description: string; locationFound: string; status: string;
  claimedByName?: string | null; createdAt: string;
  room?: { roomNumber: string; floor: number | null } | null;
  foundBy?: { name: string };
}

export default function AdminLostFoundPage() {
  const [items, setItems] = useState<LostItem[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function fetchItems() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const url = filterStatus ? `/api/admin/lost-found?status=${filterStatus}` : '/api/admin/lost-found';
      const [itemsRes, roomsRes] = await Promise.all([
        fetch(url, { headers }),
        fetch('/api/admin/rooms', { headers }),
      ]);
      const id = await itemsRes.json();
      const rd = await roomsRes.json();
      if (id.success) setItems(id.data);
      if (rd.success) setRooms(rd.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchItems(); }, [filterStatus]);

  return (
    <div data-component="AdminLostFoundPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📦 المفقودات</h1>
        <Button onClick={() => setShowCreate(true)}>+ تسجيل غرض</Button>
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'PENDING', 'CLAIMED', 'DISPOSED'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === s
                ? 'bg-[var(--gold)] text-black'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
            }`}>
            {s === '' ? 'الكل' : s === 'PENDING' ? 'قيد الانتظار' : s === 'CLAIMED' ? 'تم الاستلام' : 'تم التخلص'}
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
          <LostFoundTable items={items} basePath="/admin/lost-found" />
        </div>
      )}

      <CreateLostItemModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        rooms={rooms}
        onSuccess={fetchItems}
      />
    </div>
  );
}
