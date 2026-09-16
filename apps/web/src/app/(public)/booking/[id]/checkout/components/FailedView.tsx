'use client';

import { Button } from '@/components/ui';

interface FailedViewProps {
  error: string | null;
  onRetry: () => void;
  onChangeGateway: () => void;
  onBack: () => void;
}

export function FailedView({ error, onRetry, onChangeGateway, onBack }: FailedViewProps) {
  return (
    <div className="space-y-6 text-center" role="region" aria-label="فشل الدفع">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[rgba(231,76,60,0.1)] flex items-center justify-center">
        <svg className="h-12 w-12 text-[var(--red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-[var(--text-primary)]">فشل إتمام الدفع</h2>
      <p className="text-[var(--text-secondary)] max-w-md mx-auto">
        {error || 'حدث خطأ أثناء معالجة الدفع. يرجى المحاولة مرة أخرى أو اختيار طريقة دفع أخرى.'}
      </p>

      <div className="space-y-3">
        <Button onClick={onRetry} className="w-full" size="lg">
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          إعادة المحاولة بنفس الطريقة
        </Button>

        <Button variant="secondary" onClick={onChangeGateway} className="w-full">
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          تغيير طريقة الدفع
        </Button>

        <Button variant="ghost" onClick={onBack} className="w-full">
          رجوع لصفحة الحجز
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--red)]/20 bg-[rgba(231,76,60,0.05)] p-4 text-right">
        <h4 className="font-bold text-[var(--red)] mb-2 flex items-center justify-end gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          تنبيه
        </h4>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1 text-right">
          <li>• لم يتم خصم أي مبلغ من حسابك</li>
          <li>• يمكنك المحاولة مرة أخرى في أي وقت</li>
          <li>• للدعم الفني: تواصل معنا على support@hotel.example.com</li>
        </ul>
      </div>
    </div>
  );
}