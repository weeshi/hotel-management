'use client';

import { createContext, useContext, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
import { SuccessView } from './components/SuccessView';
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

  const step = (searchParams.get('step') as CheckoutStep) ?? 'select-gateway';
  const urlGateway = searchParams.get('gateway') as Gateway | null;

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
        const returnUrl = new URL(
          `/booking/${bookingId}/checkout`,
          window.location.origin,
        ).toString();
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
        <SuccessView
          bookingNo={booking.bookingNo}
          amount={initialTotalAmount}
          currency={hotel.currency}
        />
      )}

      {step === 'failed' && (
        <FailedView
          error={error}
          onRetry={handleRetry}
          onChangeGateway={handleBackToGatewaySelect}
          onBack={handleBackToGatewaySelect}
        />
      )}
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