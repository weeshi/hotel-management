'use client';

import { Button } from '@/components/ui';

interface CashViewProps {
  amount: number;
  currency: string;
  bookingNo: string;
  onBack: () => void;
}

export function CashView({ amount, currency, bookingNo, onBack }: CashViewProps) {
  const formatAmount = (amt: number) =>
    amt.toLocaleString('ar-LY', { minimumFractionDigits: 3 });

  return (
    <div className="space-y-6" role="region" aria-label="تعليمات الدفع النقدي">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <svg className="h-6 w-6 text-[var(--gold)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2"/>
          </svg>
          الدفع النقدي عند الوصول
        </h2>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">طريقة الدفع</p>
            <p className="font-bold text-[var(--text-primary)]">نقدي عند الوصول (عند تسجيل الوصول)</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] p-3">
            <p className="text-[var(--text-muted)] mb-1">رقم الحجز</p>
            <p className="font-bold text-[var(--text-primary)] font-mono">{bookingNo}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h3 className="font-bold text-[var(--text-primary)] mb-3">المبلغ المستحق</h3>
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">المبلغ الإجمالي</span>
          <span className="text-2xl font-bold text-[var(--gold)]">
            {formatAmount(amount)} {currency}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--gold)]/30 bg-[rgba(201,168,76,0.05)] p-4">
        <h4 className="font-bold text-[var(--gold)] mb-3 flex items-center gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          تعليمات مهمة
        </h4>
        <ul className="text-sm text-[var(--text-secondary)] space-y-2">
          <li className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 text-[var(--gold)] mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            <span>سدد المبلغ كاملاً عند تسجيل الوصول (Check-in) في مكتب الاستقبال</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 text-[var(--gold)] mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            <span>احضر رقم الحجز: <strong className="font-mono">{bookingNo}</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 text-[var(--gold)] mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            <span>يمكنك الدفع بالعملة المحلية (LYD) أو ما يعادلها بالعملات الأجنبية المقبولة</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 text-[var(--gold)] mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            <span>اطلب إيصال الدفع وتأكد من استلامه</span>
          </li>
        </ul>
      </div>

      <Button variant="secondary" onClick={onBack} className="w-full">
        رجوع لاختيار طريقة الدفع
      </Button>
    </div>
  );
}