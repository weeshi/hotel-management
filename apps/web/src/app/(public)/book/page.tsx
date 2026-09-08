'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@/components/ui';
import { BookingCalendar } from '@/components/public/BookingCalendar';
import { RoomSelector } from '@/components/public/RoomSelector';
import { GuestForm } from '@/components/public/GuestForm';
import type { AvailableRoom } from '@/lib/types/public-booking';
import { filterRoomsByCapacity } from '@/lib/utils/calendar';

type Step = 'dates' | 'rooms' | 'guest';

function BookPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('dates');
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [adults, setAdults] = useState(parseInt(searchParams.get('adults') || '1', 10));
  const [childCount, setChildCount] = useState(parseInt(searchParams.get('children') || '0', 10));
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  async function searchAvailability() {
    if (!checkIn || !checkOut) {
      setSearchError('يرجى تحديد تاريخي الوصول والمغادرة');
      return;
    }
    setLoading(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({ checkIn, checkOut, adults: String(adults), children: String(childCount) });
      const res = await fetch(`/api/public/availability?${params}`);
      const data = await res.json();
      if (!data.success) {
        setSearchError(data.error?.message || 'فشل البحث عن الغرف');
        return;
      }
      setRooms(filterRoomsByCapacity(data.data.availableRooms || [], adults, childCount));
      setStep('rooms');
    } catch {
      setSearchError('تعذر الاتصال بالخادم، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRoom(room: AvailableRoom) {
    setSelectedRoom(room);
  }

  function handleGuestSuccess(booking: { id: string; bookingNo: string; guestEmail?: string }) {
    const email = encodeURIComponent(booking.guestEmail || '');
    router.push(`/booking-confirmed?bookingNo=${booking.bookingNo}&email=${email}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-center mb-8">📝 حجز غرفة</h1>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 mb-8 text-sm">
        {(['dates', 'rooms', 'guest'] as Step[]).map((s, i) => {
          const active = step === s;
          const done = (step === 'rooms' && s === 'dates') || (step === 'guest' && (s === 'dates' || s === 'rooms'));
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
                  active ? 'bg-[var(--gold)] text-black' : done ? 'bg-[rgba(201,168,76,0.15)] text-[var(--gold)]' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'}>
                {s === 'dates' ? 'التواريخ' : s === 'rooms' ? 'الغرفة' : 'البيانات'}
              </span>
              {i < 2 && <span className="w-6 h-px bg-[var(--border)] mx-1" />}
            </div>
          );
        })}
      </div>

      {step === 'dates' && (
        <Card>
          <BookingCalendar checkIn={checkIn} checkOut={checkOut} onChange={(r) => { setCheckIn(r.checkIn); setCheckOut(r.checkOut); }} />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <Input label="عدد البالغين" type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value) || 1))} />
            <Input label="عدد الأطفال" type="number" min={0} value={childCount} onChange={(e) => setChildCount(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
          {searchError && (
            <p className="mt-4 text-sm text-[var(--red)]">{searchError}</p>
          )}
          <Button className="w-full mt-6" loading={loading} onClick={searchAvailability}>
            البحث عن الغرف المتاحة
          </Button>
        </Card>
      )}

      {step === 'rooms' && (
        <Card title="اختر غرفتك">
          <RoomSelector
            rooms={rooms}
            selectedRoomTypeId={selectedRoom?.roomType.id || ''}
            onSelect={handleSelectRoom}
            nights={Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))}
          />
          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={() => setStep('dates')} disabled={loading}>
              رجوع
            </Button>
            <Button className="flex-1" disabled={!selectedRoom} onClick={() => setStep('guest')}>
              متابعة
            </Button>
          </div>
        </Card>
      )}

      {step === 'guest' && selectedRoom && (
        <Card title="بيانات الضيف">
          <GuestForm
            room={selectedRoom}
            checkIn={checkIn}
            checkOut={checkOut}
            adults={adults}
            childCount={childCount}
            onSuccess={handleGuestSuccess}
            onBack={() => setStep('rooms')}
          />
        </Card>
      )}
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
