'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui';
import type { BookingDetails } from '@/lib/types/public-booking';

function BookingConfirmedContent() {
  const searchParams = useSearchParams();
  const bookingNo = searchParams.get('bookingNo');
  const email = searchParams.get('email') || '';

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingNo) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ bookingNo });
    if (email) params.set('email', email);
    fetch(`/api/public/bookings?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBooking(data.data);
        else setError(data.error?.message || 'تعذر استرجاع تفاصيل الحجز');
      })
      .catch(() => setError('تعذر الاتصال بالخادم'))
      .finally(() => setLoading(false));
  }, [bookingNo, email]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-3xl font-extrabold mb-4">تم تأكيد الحجز!</h1>
      <p className="text-[var(--text-secondary)] mb-8">
        شكراً لك! تم استلام طلب الحجز الخاص بك بنجاح.
        سنتواصل معك قريباً لتأكيد التفاصيل.
      </p>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 mb-8">
          <p className="text-sm text-[var(--text-secondary)] mb-2">رقم الحجز</p>
          <p className="text-2xl font-bold text-[var(--gold)]">{bookingNo || '—'}</p>
          <p className="mt-4 text-sm text-[var(--red)]">{error}</p>
        </div>
      ) : booking ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 mb-8 text-right">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--text-muted)]">رقم الحجز</p>
            <p className="text-xl font-bold text-[var(--gold)]">{booking.bookingNo}</p>
          </div>

          {booking.rooms.map((room, i) => (
            <div key={i} className="border-t border-[var(--border)] py-3">
              <p className="font-bold">{room.roomTypeName || `غرفة ${room.roomNumber}`}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {booking.checkIn} → {booking.checkOut} • {booking.nights} ليلة
              </p>
              {booking.totalAmount !== undefined && (
                <p className="text-sm text-[var(--gold)] font-bold mt-1">
                  الإجمالي: {booking.totalAmount} د.ل
                </p>
              )}
            </div>
          ))}

          {booking.cancellationPolicy && (
            <p className="border-t border-[var(--border)] py-3 text-sm text-[var(--text-secondary)]">
              سياسة الإلغاء: {booking.cancellationPolicy.nameAr || booking.cancellationPolicy.name}
            </p>
          )}

          <div className="border-t border-[var(--border)] py-3">
            <p className="text-sm font-bold mb-1">💰 الدفع</p>
            <p className="text-sm text-[var(--text-secondary)]">
              يُستلم المبلغ نقداً عند الوصول، أو عبر تحويل بنكي. سيتم التواصل معك لتأكيد التفاصيل.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 mb-8">
          <p className="text-sm text-[var(--text-secondary)] mb-2">رقم الحجز</p>
          <p className="text-2xl font-bold text-[var(--gold)]">{bookingNo || '—'}</p>
        </div>
      )}

      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all"
      >
        العودة للصفحة الرئيسية
      </Link>
    </div>
  );
}

export default function BookingConfirmedPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-16 text-center text-[var(--text-secondary)]">جاري التحميل...</div>}>
      <BookingConfirmedContent />
    </Suspense>
  );
}
