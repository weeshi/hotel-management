'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui';
import type {
  CheckoutContextValue,
  CheckoutStep,
  Gateway,
  PaymentSessionData,
  PublicBookingSummary,
  PublicHotelInfo,
} from './context/PaymentSessionContext';
import { CheckoutLayout } from './components/CheckoutLayout';
import { GatewaySelector } from './components/GatewaySelector';
import { RedirectingView } from './components/RedirectingView';
import { BankTransferView } from './components/BankTransferView';
import { CashView } from './components/CashView';
import { FailedView } from './components/FailedView';

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

function useCheckoutContext() {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckoutContext must be used within CheckoutProvider');
  }
  return context;
}

interface CheckoutProviderProps {
  children: React.ReactNode;
  initialBooking: PublicBookingSummary;
  initialHotel: PublicHotelInfo;
}

function CheckoutProvider({ children, initialBooking, initialHotel }: CheckoutProviderProps) {
  const [sessionData, setSessionData] = useState<PaymentSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {}, []);

  const value: CheckoutContextValue = {
    sessionData,
    booking: initialBooking,
    hotel: initialHotel,
    loading,
    error,
    setSessionData,
    setLoading,
    setError,
    refetch,
  };

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

interface CheckoutClientInnerProps {
  initialBooking: PublicBookingSummary;
  initialHotel: PublicHotelInfo;
  initialBalance: number;
  initialTotalAmount: number;
  bookingId: string;
}

const ELECTRONIC_GATEWAYS: Gateway[] = ['plutu', 'tlync'];

function CheckoutClientInner({
  initialBooking,
  initialHotel,
  initialBalance,
  initialTotalAmount,
  bookingId,
}: CheckoutClientInnerProps) {
  const { sessionData, booking, hotel, loading, error, setSessionData, setLoading, setError } =
    useCheckoutContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentRef = useRef<HTMLDivElement>(null);

  const step = (searchParams.get('step') as CheckoutStep) ?? 'select-gateway';
  const urlGateway = searchParams.get('gateway') as Gateway | null;

  useEffect(() => {
    contentRef.current?.focus?.();
  }, [step]);

  const goToStep = useCallback(
    (nextStep: CheckoutStep, gateway?: Gateway) => {
      const params = new URLSearchParams();
      params.set('step', nextStep);
      if (gateway) params.set('gateway', gateway);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const createPaymentSession = useCallback(
    async (gateway: Gateway) => {
      setLoading(true);
      setError(null);
      try {
        const returnUrl = `${window.location.origin}/booking/${bookingId}/checkout?step=success`;
        const res = await fetch(`/api/public/bookings/${bookingId}/payment-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway, returnUrl }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error?.message || 'فشل إنشاء جلسة الدفع');
        }
        setSessionData(data.data);
        goToStep('redirecting', gateway);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
        setError(message);
        goToStep('failed', gateway);
      } finally {
        setLoading(false);
      }
    },
    [bookingId, goToStep, setError, setLoading, setSessionData],
  );

  const handleGatewaySelect = useCallback(
    (gateway: Gateway) => {
      if (gateway === 'plutu' || gateway === 'tlync') {
        createPaymentSession(gateway);
      } else {
        setError(null);
        goToStep(gateway, gateway);
      }
    },
    [createPaymentSession, goToStep, setError],
  );

  const handleBackToGatewaySelect = useCallback(() => {
    setSessionData(null);
    setError(null);
    goToStep('select-gateway');
  }, [goToStep, setError, setSessionData]);

  const handleRetry = useCallback(() => {
    if (urlGateway && ELECTRONIC_GATEWAYS.includes(urlGateway)) {
      createPaymentSession(urlGateway);
    } else {
      handleBackToGatewaySelect();
    }
  }, [createPaymentSession, handleBackToGatewaySelect, urlGateway]);

  return (
    <CheckoutLayout
      step={step}
      booking={initialBooking}
      hotel={initialHotel}
      balance={initialBalance}
      totalAmount={initialTotalAmount}
    >
      <div ref={contentRef} tabIndex={-1} className="outline-none">
        {step === 'select-gateway' && (
        <GatewaySelector
          onSelect={handleGatewaySelect}
          loading={loading}
          balance={initialBalance}
          currency={hotel.currency}
        />
      )}

      {step === 'redirecting' && sessionData && (
        <RedirectingView
          paymentUrl={sessionData.paymentUrl}
          onCancel={handleBackToGatewaySelect}
          loading={loading}
        />
      )}

      {step === 'redirecting' && !sessionData && (
        <RedirectingView paymentUrl="" onCancel={handleBackToGatewaySelect} loading={loading} />
      )}

      {step === 'bank-transfer' && (
        <BankTransferView
          amount={initialBalance}
          currency={hotel.currency}
          onBack={handleBackToGatewaySelect}
        />
      )}

      {step === 'cash' && (
        <CashView
          amount={initialBalance}
          currency={hotel.currency}
          bookingNo={booking.bookingNo}
          onBack={handleBackToGatewaySelect}
        />
      )}

      {step === 'success' && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center" role="region" aria-label="تعذر تأكيد حالة الدفع">
          <div className="w-20 h-20 rounded-full bg-[rgba(231,76,60,0.1)] flex items-center justify-center mb-6">
            <svg className="h-10 w-10 text-[var(--red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">حالة الدفع غير مؤكدة</h2>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md">
            لا يتم عرض رسالة النجاح إلا بعد التحقق من الدفعة. أعد تحميل هذه الصفحة للتحقق مرة أخرى.
          </p>
          <Button variant="secondary" onClick={handleBackToGatewaySelect}>
            العودة لاختيار طريقة الدفع
          </Button>
        </div>
      )}

      {step === 'failed' && (
        <FailedView
          error={error}
          onRetry={handleRetry}
          onChangeGateway={handleBackToGatewaySelect}
          onBack={handleBackToGatewaySelect}
        />
      )}
      </div>
    </CheckoutLayout>
  );
}

interface CheckoutClientProps {
  initialBooking: PublicBookingSummary;
  initialHotel: PublicHotelInfo;
  initialBalance: number;
  initialTotalAmount: number;
  bookingId: string;
}

export function CheckoutClient({
  initialBooking,
  initialHotel,
  initialBalance,
  initialTotalAmount,
  bookingId,
}: CheckoutClientProps) {
  return (
    <CheckoutProvider initialBooking={initialBooking} initialHotel={initialHotel}>
      <CheckoutClientInner
        initialBooking={initialBooking}
        initialHotel={initialHotel}
        initialBalance={initialBalance}
        initialTotalAmount={initialTotalAmount}
        bookingId={bookingId}
      />
    </CheckoutProvider>
  );
}