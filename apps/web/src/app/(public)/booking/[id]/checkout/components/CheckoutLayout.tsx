'use client';

import { ProgressSteps } from './ProgressSteps';

interface CheckoutLayoutProps {
  children: React.ReactNode;
  step: 'select-gateway' | 'redirecting' | 'bank-transfer' | 'cash' | 'success' | 'failed';
  booking: {
    bookingNo: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    guestName: string;
  };
  hotel: {
    name: string;
    nameAr: string | null;
    currency: string;
  };
  balance: number;
  totalAmount: number;
}

export function CheckoutLayout({ children, step, booking, hotel, balance, totalAmount }: CheckoutLayoutProps) {
  const formatCurrency = (amount: number, currency = 'LYD') =>
    new Intl.NumberFormat('ar-LY', { style: 'currency', currency, minimumFractionDigits: 3 }).format(amount);

  return (
    <div className="min-h-screen bg-[var(--bg)]" dir="rtl">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">إتمام الدفع</h1>
              <p className="text-sm text-[var(--text-muted)]">الحجز: {booking.bookingNo}</p>
            </div>
            <div className="text-left">
              <p className="text-sm text-[var(--text-secondary)]">المبلغ المستحق</p>
              <p className="text-xl font-bold text-[var(--gold)]">{balance.toLocaleString('ar-LY', { minimumFractionDigits: 3 })} د.ل</p>
            </div>
          </div>
        </div>
        <ProgressSteps currentStep={step} />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="bg-[var(--bg-card)] border-t border-[var(--border)] py-4">
        <div className="max-w-3xl mx-auto px-4 text-center text-sm text-[var(--text-muted)]">
          عملية دفع آمنة عبر بوابات معتمدة • للاستفسارات: support@hotel.example.com
        </div>
      </footer>
    </div>
  );
}