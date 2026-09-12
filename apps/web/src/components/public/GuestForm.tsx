'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { AvailableRoom } from '@/lib/types/public-booking';

interface GuestFormProps {
  room: AvailableRoom;
  checkIn: string;
  checkOut: string;
  adults: number;
  childCount: number;
  onSuccess: (booking: { id: string; bookingNo: string }) => void;
  onBack: () => void;
}

export function GuestForm({ room, checkIn, checkOut, adults, childCount, onSuccess, onBack }: GuestFormProps) {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomTypeId: room.roomType.id,
          checkIn,
          checkOut,
          adults,
          children: childCount,
          guestName,
          guestEmail,
          guestPhone,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || 'فشل إنشاء الحجز');
        return;
      }
      onSuccess(data.data.booking);
    } catch {
      setError('تعذر الاتصال بالخادم، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[var(--red)] bg-[rgba(231,76,60,0.08)] text-[var(--red)] px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm">
        <p className="text-[var(--text-secondary)] mb-1">
          {room.roomType.nameAr || room.roomType.name}
        </p>
        <p className="text-[var(--text-secondary)]">
          {checkIn} → {checkOut} • {adults} بالغ، {childCount} طفل
        </p>
        {room.pricing?.totalAmount !== undefined && (
          <p className="text-[var(--gold)] font-bold mt-2">
            المبلغ النهائي: {room.pricing.totalAmount} د.ل
          </p>
        )}
      </div>

      <Input
        label="الاسم الكامل"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        required
        placeholder="أدخل اسمك الكامل"
      />
      <Input
        label="البريد الإلكتروني"
        type="email"
        value={guestEmail}
        onChange={(e) => setGuestEmail(e.target.value)}
        required
        placeholder="example@email.com"
      />
      <Input
        label="رقم الهاتف"
        type="tel"
        value={guestPhone}
        onChange={(e) => setGuestPhone(e.target.value)}
        required
        placeholder="09xxxxxxxx"
      />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={loading}>
          رجوع
        </Button>
        <Button type="submit" loading={loading} className="flex-1">
          تأكيد الحجز
        </Button>
      </div>
    </form>
  );
}
