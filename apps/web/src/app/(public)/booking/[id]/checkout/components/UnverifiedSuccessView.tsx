'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 5;

interface UnverifiedSuccessViewProps {
  bookingId: string;
  sessionId?: string;
}

async function fetchVerified(bookingId: string, sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/public/bookings/${bookingId}/payment-session/${sessionId}/status`,
      { cache: 'no-store' }
    );
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const body = await res.json();
    return body?.data?.verified === true;
  } catch {
    return false;
  }
}

export function UnverifiedSuccessView({ bookingId, sessionId }: UnverifiedSuccessViewProps) {
  const router = useRouter();
  const attempts = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [checking, setChecking] = useState(Boolean(sessionId));

  useEffect(() => {
    if (!sessionId) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      attempts.current += 1;
      if (attempts.current > MAX_POLL_ATTEMPTS) {
        setChecking(false);
        return;
      }
      const verified = await fetchVerified(bookingId, sessionId);
      if (cancelled) return;
      if (verified) {
        setChecking(false);
        router.refresh();
      }
    };

    const id = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [router, bookingId, sessionId, cycle]);

  const manualRetry = () => {
    if (!sessionId) {
      router.refresh();
      return;
    }
    attempts.current = 0;
    setChecking(true);
    setCycle((c) => c + 1);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" dir="rtl">
      <div
        data-testid="checkout-unverified"
        className="max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[rgba(231,76,60,0.1)] flex items-center justify-center">
          <svg className="h-10 w-10 text-[var(--red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          {checking ? 'في انتظار تأكيد الدفع' : 'تعذر تأكيد حالة الدفع'}
        </h2>
        <p className="text-[var(--text-secondary)] mb-6">
          {checking
            ? 'نتحقق من حالة الدفعة كل 3 ثوانٍ... إذا أكملت الدفع للتو سيتأكد خلال لحظات.'
            : 'لم نجد دفعة ناجحة مرتبطة بهذا الحجز. يمكنك إعادة المحاولة يدوياً.'}
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={manualRetry}
            className="inline-flex w-full items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="إعادة التحقق من حالة الدفع"
          >
            {checking && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {checking ? 'جاري التحقق تلقائياً...' : 'إعادة التحقق'}
          </button>

          <a
            href={`/booking/${bookingId}/checkout`}
            className="inline-flex w-full items-center justify-center px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] font-bold hover:border-[var(--gold)] hover:text-[var(--gold)]"
          >
            العودة لصفحة الدفع
          </a>
        </div>

        <p className="mt-4 text-xs text-[var(--text-muted)]" aria-hidden={!checking}>
          {checking
            ? 'يتم التحقق من حالة الجلسة كل 3 ثوانٍ (بحد أقصى 5 محاولات)'
            : 'إذا استمر التأخير، تأكد من إتمام الدفع ثم عاود المحاولة.'}
        </p>
      </div>
    </div>
  );
}