'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { DateRangeCard } from '@/components/bookings/DateRangeCard';
import { GuestInfoCard } from '@/components/bookings/GuestInfoCard';
import { RoomSelectionCard } from '@/components/bookings/RoomSelectionCard';
import { InvoiceSummaryCard } from '@/components/bookings/InvoiceSummaryCard';
import { ServicesCard } from '@/components/bookings/ServicesCard';
import { apiGet, apiPost } from '@/lib/utils/api-client';
import type { Room, RatePlanOption } from '@/components/bookings/types';

export default function NewBookingPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allRatePlans, setAllRatePlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestId, setGuestId] = useState<string | undefined>();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRooms, setSelectedRooms] = useState<Record<string, number>>({});
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});

  useEffect(() => {
    async function init() {
      try {
        const [roomsRes, plansRes] = await Promise.all([
          apiGet('/api/admin/rooms'),
          apiGet('/api/admin/rate-plans').catch(() => null),
        ]);
        if (roomsRes.success) setRooms(roomsRes.data);
        if (plansRes?.success) setAllRatePlans(plansRes.data);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const ratePlansByRoomType = useMemo(() => {
    const map: Record<string, RatePlanOption[]> = {};
    for (const plan of allRatePlans) {
      if (!plan.isActive) continue;
      if (checkIn && checkOut) {
        const planStart = new Date(plan.startDate);
        const planEnd = new Date(plan.endDate);
        const ci = new Date(checkIn);
        const co = new Date(checkOut);
        if (ci < planStart || co > planEnd) continue;
      }
      if (!map[plan.roomTypeId]) map[plan.roomTypeId] = [];
      map[plan.roomTypeId].push({
        id: plan.id,
        name: plan.name,
        nameAr: plan.nameAr,
        nightlyRate: plan.nightlyRate,
        minStay: plan.minStay,
        maxAdults: plan.maxAdults,
        maxChildren: plan.maxChildren,
        extraBedPrice: plan.extraBedPrice,
        cancellationPolicyName: plan.cancellationPolicy?.nameAr || plan.cancellationPolicy?.name,
      });
    }
    return map;
  }, [allRatePlans, checkIn, checkOut]);

  const totalBeforeTax = Object.values(selectedRooms).reduce((sum, rate) => sum + rate, 0);
  const nights = checkIn && checkOut
    ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 0;
  const totalCharges = totalBeforeTax * nights;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!checkIn || !checkOut) { setError('اختر تاريخ الوصول والمغادرة'); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { setError('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول'); return; }
    if (!guestName.trim()) { setError('أدخل اسم النزيل'); return; }
    if (Object.keys(selectedRooms).length === 0) { setError('اختر غرفة واحدة على الأقل'); return; }

    setSubmitting(true);
    try {
      const servicesPayload = Object.entries(selectedServices)
        .filter(([_, qty]) => qty > 0)
        .map(([serviceId, quantity]) => ({ serviceId, quantity }));

      const res = await apiPost('/api/admin/bookings', {
        guestId: guestId || undefined,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestPhone: guestPhone.trim() || undefined,
        adults, children,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
        rooms: Object.entries(selectedRooms).map(([roomId, nightlyRate]) => ({ roomId, nightlyRate })),
        services: servicesPayload.length > 0 ? servicesPayload : undefined,
        source: 'RECEPTION',
      });
      if (!res.success) throw new Error(res.error?.message || 'فشل إنشاء الحجز');
      router.push(`/reception/checkin?bookingId=${res.data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleRoom(roomId: string) {
    setSelectedRooms(prev => {
      if (roomId in prev) {
        const { [roomId]: _, ...rest } = prev;
        return rest;
      }
      const room = rooms.find(r => r.id === roomId);
      return { ...prev, [roomId]: room?.roomType.baseRate ?? 0 };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div data-component="NewBookingPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🆕 حجز جديد</h1>
        <Button variant="secondary" onClick={() => router.back()}>رجوع</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">{error}</div>
        )}

        <DateRangeCard checkIn={checkIn} checkOut={checkOut} nights={nights}
          onCheckInChange={setCheckIn} onCheckOutChange={setCheckOut} />

        <GuestInfoCard guestId={guestId} guestName={guestName} guestEmail={guestEmail} guestPhone={guestPhone}
          adults={adults} numChildren={children}
          onGuestIdChange={setGuestId} onNameChange={setGuestName} onEmailChange={setGuestEmail} onPhoneChange={setGuestPhone}
          onAdultsChange={setAdults} onChildrenChange={setChildren} />

        <RoomSelectionCard rooms={rooms} selectedRooms={selectedRooms} ratePlans={ratePlansByRoomType}
          onToggleRoom={toggleRoom} onRateChange={(roomId, rate) => setSelectedRooms(prev => ({ ...prev, [roomId]: rate }))} />

        <ServicesCard selectedServices={selectedServices} onServicesChange={setSelectedServices} />

        <InvoiceSummaryCard rooms={rooms} selectedRooms={selectedRooms} nights={nights} totalCharges={totalCharges} />

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" type="button" onClick={() => router.back()}>إلغاء</Button>
          <Button type="submit" loading={submitting}>
            {submitting ? 'جاري إنشاء الحجز...' : '✅ تأكيد الحجز'}
          </Button>
        </div>
      </form>
    </div>
  );
}
