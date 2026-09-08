'use client';

import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';
import { apiPost } from '@/lib/utils/api-mutation';
import { apiGet } from '@/lib/utils/api-client';
import type { GroupBookingData } from './types';

interface RoomOption {
  id: string;
  roomNumber: string;
  floor: number | null;
  roomType: { name: string; nameAr: string; baseRate: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (group: GroupBookingData) => void;
  groupId: string;
  hotelId: string;
}

export function CreateSubBookingModal({ open, onClose, onSuccess, groupId }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [roomId, setRoomId] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCheckIn('');
    setCheckOut('');
    setRoomId('');
    setAdults(1);
    setChildren(0);
    setGuestName('');
    setGuestPhone('');
    setRooms([]);
  }, [open]);

  useEffect(() => {
    if (!open || !checkIn || !checkOut) return;
    setFetching(true);
    apiGet(`/api/admin/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}`)
      .then((res: any) => {
        if (res?.success) setRooms(res.data || []);
        else setRooms([]);
      })
      .finally(() => setFetching(false));
  }, [open, checkIn, checkOut]);

  const selectedRoom = rooms.find(r => r.id === roomId);
  const nightlyRate = selectedRoom?.roomType.baseRate ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!checkIn || !checkOut) { showErrorModal('اختر تاريخ الوصول والمغادرة'); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { showErrorModal('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول'); return; }
    if (!roomId) { showErrorModal('اختر غرفة'); return; }
    if (!guestName.trim()) { showErrorModal('أدخل اسم النزيل'); return; }

    setLoading(true);
    await apiPost(`/api/admin/group-bookings/${groupId}/sub-booking`, {
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      roomId,
      nightlyRate,
      adults,
      children,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || undefined,
    }, {
      successMsg: '✅ تم إنشاء الحجز الفرعي',
      errorMsg: 'فشل إنشاء الحجز',
      onSuccess: async () => {
        const res = await apiGet(`/api/admin/group-bookings/${groupId}`);
        if (res?.success) onSuccess(res.data);
        onClose();
      },
    });
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="➕ إنشاء حجز فرعي للمجموعة" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">تاريخ الوصول</label>
            <input
              type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">تاريخ المغادرة</label>
            <input
              type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">الغرفة</label>
          {fetching ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              جاري تحميل الغرف المتاحة...
            </div>
          ) : (
            <select
              value={roomId} onChange={e => setRoomId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            >
              <option value="">-- اختر غرفة --</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber} — {r.roomType.nameAr || r.roomType.name}
                </option>
              ))}
            </select>
          )}
          {nightlyRate > 0 && (
            <p className="text-xs text-[var(--text-muted)]">السعر لليلة: {nightlyRate} د.ل</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">البالغين</label>
            <input
              type="number" min={1} max={10} value={adults}
              onChange={e => setAdults(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">الأطفال</label>
            <input
              type="number" min={0} max={10} value={children}
              onChange={e => setChildren(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">اسم النزيل</label>
          <input
            type="text" value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="أدخل اسم النزيل"
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">رقم الهاتف (اختياري)</label>
          <input
            type="tel" value={guestPhone}
            onChange={e => setGuestPhone(e.target.value)}
            placeholder="أدخل رقم الهاتف"
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit" loading={loading}>إنشاء الحجز الفرعي</Button>
        </div>
      </form>
    </Modal>
  );
}
