'use client';

import { Button } from '@/components/ui';

interface SuccessViewProps {
  bookingNo: string;
  amount: number;
  currency: string;
}

export function SuccessView({ bookingNo, amount, currency }: SuccessViewProps) {
  const formatAmount = (amt: number) =>
    amt.toLocaleString('ar-LY', { minimumFractionDigits: 3 });

  return (
    <div className="space-y-6 text-center" role="status" aria-live="polite" aria-label="نجح الدفع">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[rgba(34,197,94,0.1)] flex items-center justify-center">
        <svg className="h-12 w-12 text-[var(--green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-[var(--text-primary)]">تم الدفع بنجاح!</h2>
      <p className="text-[var(--text-secondary)]">
        تم استلام دفعتك بنجاح وتأكيد حجزك.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-sm text-[var(--text-muted)]">رقم الحجز</p>
            <p className="font-bold text-lg text-[var(--text-primary)] font-mono">{bookingNo}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--text-muted)]">المبلغ المدفوع</p>
            <p className="font-bold text-lg text-[var(--green)]">
              {formatAmount(amount)} {currency}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--green)]/30 bg-[rgba(34,197,94,0.05)] p-4">
        <h4 className="font-bold text-[var(--green)] mb-2 flex items-center justify-center gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          تم تأكيد حجزك
        </h4>
        <p className="text-sm text-[var(--text-secondary)]">
          سيتم إرسال تأكيد الحجز وتفاصيل الإقامة إلى بريدك الإلكتروني. يرجى حفظ رقم الحجز للمراجعة.
        </p>
      </div>

      <div className="flex gap-3">
        <a
          href={`/booking/${bookingNo}`}
          className="flex-1"
        >
          <Button variant="secondary">
            عرض تفاصيل الحجز
          </Button>
        </a>
        <Button>
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          طباعة الإيصال
        </Button>
      </div>
    </div>
  );
}