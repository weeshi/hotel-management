'use client';

import { useState, useEffect } from 'react';
import { Modal, Input, Button, EmptyState } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';
import { apiGet } from '@/lib/utils/api-client';
import type { BookingData } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId: string;
  hotelId: string;
}

export function AssignBookingsModal({ open, onClose, onSuccess, groupId }: Props) {
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    setSelected([]);
    setSearch('');

    apiGet(`/api/admin/bookings?status=CONFIRMED,CHECKED_IN&limit=50`)
      .then((res: any) => {
        if (res?.success) setBookings(res.data || []);
      })
      .finally(() => setFetching(false));
  }, [open]);

  const filtered = bookings.filter(b =>
    !b.guestName || b.guestName.toLowerCase().includes(search.toLowerCase()) ||
    b.bookingNo.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleAssign() {
    if (selected.length === 0) return;
    setLoading(true);

    await apiPost(`/api/admin/group-bookings/${groupId}/assign`, { bookingIds: selected }, {
      successMsg: `✅ تم إضافة ${selected.length} حجز إلى المجموعة`,
      errorMsg: 'فشل إضافة الحجوزات',
      onSuccess: () => {
        onSuccess();
        onClose();
      },
    });

    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="📋 إضافة حجوزات للمجموعة" size="lg">
      <div className="space-y-4">
        <Input
          placeholder="🔍 بحث برقم الحجز أو اسم النزيل"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-80 overflow-y-auto space-y-2 border border-[var(--border)] rounded-xl p-2">
          {fetching ? (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-6 w-6 text-[var(--gold)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="لا توجد حجوزات" />
          ) : (
            filtered.map(b => (
              <label
                key={b.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(b.id)}
                  onChange={() => toggle(b.id)}
                  className="w-5 h-5 accent-[var(--gold)]"
                />
                <div className="flex-1">
                  <div className="font-bold">{b.guestName || 'بدون اسم'}</div>
                  <div className="text-sm text-[var(--text-muted)]">{b.bookingNo}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  b.status === 'CHECKED_IN' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {b.status === 'CHECKED_IN' ? 'مقيم' : 'مؤكد'}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="text-sm text-[var(--text-muted)]">
          تم اختيار {selected.length} حجز
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleAssign} loading={loading} disabled={selected.length === 0}>
            إضافة للمجموعة
          </Button>
        </div>
      </div>
    </Modal>
  );
}
