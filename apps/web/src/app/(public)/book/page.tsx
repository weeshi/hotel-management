'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Input, Card } from '@/components/ui';

interface RoomType {
  id: string;
  name: string;
  nameAr?: string;
  baseRate: number;
}

function BookPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedType, setSelectedType] = useState(searchParams.get('roomTypeId') || '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/public/room-types')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRoomTypes(data.data);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomTypeId: selectedType, checkIn, checkOut, name, email, phone }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/booking-confirmed?id=${data.data.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-center mb-8">📝 حجز غرفة</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">نوع الغرفة</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
              required
            >
              <option value="">اختر نوع الغرفة</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.nameAr || rt.name} — {rt.baseRate} د.ل/ليلة</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="تاريخ الدخول" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
            <Input label="تاريخ الخروج" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
          </div>

          <Input label="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="رقم الهاتف" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />

          <Button type="submit" loading={loading} className="w-full">
            تأكيد الحجز
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-center text-[var(--text-secondary)]">جاري التحميل...</div>}>
      <BookPageContent />
    </Suspense>
  );
}
