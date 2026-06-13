'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function BookingConfirmedPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-3xl font-extrabold mb-4">تم تأكيد الحجز!</h1>
      <p className="text-[var(--text-secondary)] mb-8">
        شكراً لك! تم استلام طلب الحجز الخاص بك بنجاح.
        سنتواصل معك قريباً لتأكيد التفاصيل.
      </p>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 mb-8">
        <p className="text-sm text-[var(--text-muted)] mb-2">رقم الحجز</p>
        <p className="text-2xl font-bold text-[var(--gold)]">{bookingId || '—'}</p>
      </div>
      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all"
      >
        العودة للصفحة الرئيسية
      </Link>
    </div>
  );
}
