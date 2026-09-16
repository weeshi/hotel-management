'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

interface RedirectingViewProps {
  paymentUrl: string;
  onCancel: () => void;
  loading: boolean;
}

export function RedirectingView({ paymentUrl, onCancel, loading }: RedirectingViewProps) {
  const [redirecting, setRedirecting] = useState(false);

  const handleRedirect = () => {
    if (!paymentUrl) return;
    setRedirecting(true);
    // Explicit redirect - no countdown
    window.location.href = paymentUrl;
  };

  if (!paymentUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center" role="region" aria-label="جلسة دفع غير متوفرة">
        <div className="w-20 h-20 rounded-full bg-[rgba(231,76,60,0.1)] flex items-center justify-center mb-6">
          <svg className="h-10 w-10 text-[var(--red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">جلسة الدفع غير متوفرة</h2>
        <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
          لم تبدأ عملية الدفع بعد. يرجى اختيار طريقة الدفع للمتابعة.
        </p>
        <Button variant="secondary" onClick={onCancel} className="w-full max-w-md">
          العودة لاختيار طريقة الدفع
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center" role="region" aria-label="التوجيه لبوابة الدفع">
      <div className="w-20 h-20 rounded-full bg-[rgba(201,168,76,0.1)] flex items-center justify-center mb-6">
        <svg className="h-10 w-10 text-[var(--gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">جاري التوجيه لبوابة الدفع</h2>
      <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
        سيتم نقلك الآن إلى بوابة الدفع الآمنة لإتمام عملية الدفع. تأكد من إتمام الدفع خلال المهلة المحددة.
      </p>

      <div className="w-full max-w-md space-y-3">
        <Button
          onClick={handleRedirect}
          disabled={loading || redirecting}
          className="w-full"
          size="lg"
        >
          {redirecting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              جاري التوجيه...
            </>
          ) : (
            'الانتقال للبوابة الآن'
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={loading || redirecting}
          className="w-full"
        >
          إلغاء والعودة
        </Button>
      </div>

      <p className="mt-4 text-xs text-[var(--text-muted)]">
        إذا لم يتم التوجيه تلقائياً، اضغط الزر أعلاه. ستنتهي صلاحية الجلسة خلال 30 دقيقة.
      </p>
    </div>
  );
}