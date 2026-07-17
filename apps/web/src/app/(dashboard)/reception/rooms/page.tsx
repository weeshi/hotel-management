'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Select } from '@/components/ui';
import { addToast } from '@/lib/utils/toast';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  status: string;
  housekeepingStatus: string;
  roomType: { name: string; baseRate: number };
}

const statusLabels: Record<string, string> = {
  AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', MAINTENANCE: 'صيانة', DIRTY: 'تحت التنظيف',
};
const hkLabels: Record<string, string> = {
  CLEAN: 'نظيف', DIRTY: 'متسخ', IN_PROGRESS: 'قيد التنظيف', INSPECTED: 'تم التفتيش',
};

const statusOptions = [
  { value: 'AVAILABLE', label: 'متاحة' },
  { value: 'OCCUPIED', label: 'مشغولة' },
  { value: 'MAINTENANCE', label: 'صيانة' },
  { value: 'DIRTY', label: 'تحت التنظيف' },
];

const hkOptions = [
  { value: 'CLEAN', label: 'نظيف' },
  { value: 'DIRTY', label: 'متسخ' },
  { value: 'IN_PROGRESS', label: 'قيد التنظيف' },
  { value: 'INSPECTED', label: 'تم التفتيش' },
];

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Room | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editHk, setEditHk] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRooms = useCallback(async () => {
    const res = await fetch('/api/admin/rooms', {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    });
    const data = await res.json();
    if (data.success) setRooms(data.data);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  function openModal(room: Room) {
    setSelected(room);
    setEditStatus(room.status);
    setEditHk(room.housekeepingStatus);
  }

  async function saveStatus() {
    if (!selected) return;
    setSaving(true);
    await getCsrfToken();
    try {
      const body: Record<string, string> = {};
      if (editStatus !== selected.status) body.status = editStatus;
      if (editHk !== selected.housekeepingStatus) body.housekeepingStatus = editHk;
      if (Object.keys(body).length === 0) { setSaving(false); setSelected(null); return; }

      const res = await fetch(`/api/admin/rooms/${selected.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const taskCreated = body.housekeepingStatus === 'DIRTY';
        addToast('success', taskCreated ? '✅ تم تحديث الحالة وتم إنشاء مهمة تنظيف' : '✅ تم تحديث الحالة');
        setSelected(null);
        fetchRooms();
      } else {
        addToast('error', data.error?.message || 'فشل تحديث الحالة');
      }
    } catch {
      addToast('error', 'حدث خطأ في الاتصال');
    } finally { setSaving(false); }
  }

  const filtered = filter ? rooms.filter((r) => r.status === filter) : rooms;

  return (
    <div data-component="ReceptionRoomsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🚪 إدارة الغرف</h1>
        <div className="flex gap-2 overflow-x-auto">
          {['', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'DIRTY'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === s
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {statusLabels[s] || 'الكل'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map((room) => (
          <button
            key={room.id}
            onClick={() => openModal(room)}
            className="card !p-4 text-center hover:shadow-lg transition-shadow cursor-pointer text-right"
          >
            <div className="text-2xl mb-2">
              {room.status === 'OCCUPIED' ? '🔴' : room.status === 'MAINTENANCE' ? '🔧' : room.housekeepingStatus === 'DIRTY' ? '🧹' : '🟢'}
            </div>
            <div className="text-xl font-bold">{room.roomNumber}</div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              {room.roomType?.name || 'غير محدد'}
            </div>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-xs font-medium">{statusLabels[room.status] || room.status}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{hkLabels[room.housekeepingStatus] || room.housekeepingStatus}</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2">
              {room.roomType?.baseRate} د.ل/ليلة
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">لا توجد غرف</div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`تحديث حالة الغرفة ${selected?.roomNumber || ''}`}>
        <div className="space-y-4">
          <Select
            label="حالة الغرفة"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            options={statusOptions}
          />
          <Select
            label="حالة النظافة"
            value={editHk}
            onChange={(e) => setEditHk(e.target.value)}
            options={hkOptions}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>إلغاء</Button>
            <Button onClick={saveStatus} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
