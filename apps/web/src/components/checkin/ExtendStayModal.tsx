'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import type { Booking } from './types';

interface Props {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ExtendStayModal({ open, booking, onClose, onSaved }: Props) {
  const [newCheckOut, setNewCheckOut] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!booking) return null;

  const currentRoom = booking.rooms?.[0];
  const currentCheckOut = currentRoom?.checkOut
    ? typeof currentRoom.checkOut === 'string'
      ? currentRoom.checkOut.split('T')[0]
      : ''
    : '';
  const currentCheckIn = currentRoom?.checkIn
    ? typeof currentRoom.checkIn === 'string'
      ? currentRoom.checkIn.split('T')[0]
      : ''
    : '';

  function calcExtraNights(): number {
    if (!newCheckOut || !currentCheckOut) return 0;
    const old = new Date(currentCheckOut);
    const nu = new Date(newCheckOut);
    if (nu <= old) return 0;
    return Math.ceil((nu.getTime() - old.getTime()) / 86400000);
  }

  async function handleExtend() {
    if (!booking || !newCheckOut) return;
    if (new Date(newCheckOut) <= new Date(currentCheckOut)) {
      setError('تاريخ المغادرة الجديد يجب أن يكون بعد التاريخ الحالي');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await getCsrfToken();
      const res = await fetch(`/api/admin/bookings/${booking.id}/extend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ newCheckOut }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error || 'فشل تمديد الإقامة');
      }
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  const extraNights = calcExtraNights();

  return (
    <Modal open={open} onClose={onClose} title="📅 تمديد الإقامة" size="md">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>النزيل:</strong> {booking.guestName || booking.guest?.name || 'غير محدد'}</div>
          <div><strong>الغرفة:</strong> {currentRoom?.room.roomNumber || '-'}</div>
          <div><strong>تاريخ الوصول:</strong> {currentCheckIn}</div>
          <div><strong>تاريخ المغادرة الحالي:</strong> {currentCheckOut}</div>
        </div>

        <Input
          label="تاريخ المغادرة الجديد"
          type="date"
          value={newCheckOut}
          min={currentCheckOut || undefined}
          onChange={(e) => setNewCheckOut(e.target.value)}
        />

        {extraNights > 0 && (
          <div className="bg-[rgba(46,204,113,0.1)] border border-[var(--green)] text-sm p-3 rounded-lg space-y-1">
            <div className="font-bold text-[var(--green)]">📋 ملخص التمديد</div>
            <div className="text-[var(--text-secondary)]">
              ليالٍ إضافية: <strong className="text-[var(--text-primary)]">{extraNights}</strong>
            </div>
            <div className="text-[var(--text-secondary)]">
              من: {currentCheckOut} → إلى: {newCheckOut}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              سيتم إعادة حساب رسوم الغرفة وإضافة الفرق إلى الفاتورة
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-[var(--red)] bg-[rgba(231,76,60,0.1)] p-3 rounded-lg">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleExtend} disabled={!newCheckOut || extraNights <= 0 || saving}>
            {saving ? 'جاري التمديد...' : '📅 تأكيد تمديد الإقامة'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
