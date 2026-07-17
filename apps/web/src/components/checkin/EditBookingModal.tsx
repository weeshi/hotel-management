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

export function EditBookingModal({ open, booking, onClose, onSaved }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useState(() => {
    if (booking) {
      const room = booking.rooms?.[0];
      if (room?.checkIn) setCheckIn(typeof room.checkIn === 'string' ? room.checkIn.split('T')[0] : '');
      if (room?.checkOut) setCheckOut(typeof room.checkOut === 'string' ? room.checkOut.split('T')[0] : '');
      setGuestName(booking.guestName || '');
      setGuestPhone(booking.guestPhone || booking.guest?.phone || '');
    }
  });

  async function handleSave() {
    if (!booking) return;
    setSaving(true);
    setError('');
    try {
      await getCsrfToken();
      const body: Record<string, any> = {};
      if (checkIn) body.checkIn = checkIn;
      if (checkOut) body.checkOut = checkOut;
      if (guestName) body.guestName = guestName;
      if (guestPhone) body.guestPhone = guestPhone;

      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
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
        onSaved();
        onClose();
      } else {
        setError(data.error || 'فشل التعديل');
      }
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  }

  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="✏️ تعديل الحجز" size="md">
      <div className="space-y-4">
        <div className="text-sm bg-[var(--bg-primary)] p-3 rounded-lg">
          <div><strong>الحجز:</strong> #{booking.bookingNo}</div>
          <div><strong>الحالة:</strong> {booking.status === 'CONFIRMED' ? 'مؤكد' : booking.status}</div>
        </div>

        <Input
          label="تاريخ الوصول"
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
        <Input
          label="تاريخ المغادرة"
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
        <Input
          label="اسم النزيل"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <Input
          label="رقم الهاتف"
          value={guestPhone}
          onChange={(e) => setGuestPhone(e.target.value)}
        />

        {error && (
          <div className="text-sm text-[var(--red)] bg-[rgba(231,76,60,0.1)] p-3 rounded-lg">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
