'use client';

import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import type { Booking } from './types';

interface RoomOption {
  id: string;
  roomNumber: string;
  floor: number | null;
  status: string;
  roomType: { name: string; nameAr: string | null; baseRate: number };
}

interface Props {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}

export function MoveRoomModal({ open, booking, onClose, onSaved }: Props) {
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setSelectedRoomId('');
      setReason('');
      fetch('/api/admin/rooms?status=AVAILABLE&status=DIRTY', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setAvailableRooms(data.data);
        })
        .catch(() => showErrorModal('فشل تحميل الغرف المتاحة'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  async function handleMove() {
    if (!booking || !selectedRoomId) return;
    setSaving(true);
    try {
      await getCsrfToken();
      const res = await fetch(`/api/admin/bookings/${booking.id}/move-room`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ targetRoomId: selectedRoomId, reason }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        showErrorModal(data.error || 'فشل نقل الغرفة');
      }
    } catch {
      showErrorModal('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId);
  const currentRoom = booking?.rooms?.[0];

  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="🚚 نقل الغرفة" size="md">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>النزيل:</strong> {booking.guestName || booking.guest?.name || 'غير محدد'}</div>
          <div><strong>الغرفة الحالية:</strong> {currentRoom?.room.roomNumber || '-'}</div>
          <div><strong>الحالة:</strong> مقيم</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin h-6 w-6 text-[var(--gold)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">الغرفة الجديدة</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]"
            >
              <option value="">-- اختر غرفة --</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} - {room.roomType.nameAr || room.roomType.name} - الطابق {room.floor || '-'} ({room.status === 'AVAILABLE' ? 'متاحة' : 'تحت التنظيف'})
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedRoom && (
          <div className="bg-[rgba(46,204,113,0.1)] border border-[var(--green)] text-sm p-3 rounded-lg space-y-1">
            <div className="font-bold text-[var(--green)]">ملخص النقل</div>
            <div className="text-[var(--text-secondary)]">
              من: <strong className="text-[var(--text-primary)]">{currentRoom?.room.roomNumber || '-'}</strong>
              {' → '}
              إلى: <strong className="text-[var(--text-primary)]">{selectedRoom.roomNumber}</strong>
            </div>
            <div className="text-[var(--text-secondary)]">
              النوع: {selectedRoom.roomType.nameAr || selectedRoom.roomType.name}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              سيتم إرجاع رصيد الليالي المتبقية للغرفة القديمة وإضافة رسوم الغرفة الجديدة
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">سبب النقل (اختياري)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً: تسريب مياه، طلب النزيل..."
            className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleMove} disabled={!selectedRoomId || saving}>
            {saving ? 'جاري النقل...' : '🚚 تأكيد نقل الغرفة'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
