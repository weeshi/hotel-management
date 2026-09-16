import { Suspense } from 'react';
import { prisma } from '@/lib/utils/prisma';
import { notFound } from 'next/navigation';
import { CheckoutClient } from './CheckoutClient';
import { SuccessView } from './components/SuccessView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type BookingCheckoutData = {
  booking: {
    id: string;
    bookingNo: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    status: string;
    totalAmount: number;
    currency: string;
  };
  hotel: {
    id: string;
    name: string;
    nameAr: string | null;
    currency: string;
    timezone: string;
  };
  balance: number;
  totalAmount: number;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: 'إتمام الدفع - نظام إدارة الفنادق',
    description: 'صفحة الدفع الآمنة لحجزك الفندقي',
  };
}

async function getBookingData(bookingId: string): Promise<BookingCheckoutData | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      folio: {
        select: {
          id: true,
          totalCharges: true,
          totalPaid: true,
          balance: true,
          status: true,
        },
      },
      rooms: {
        select: {
          checkIn: true,
          checkOut: true,
        },
      },
      hotel: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          currency: true,
          timezone: true,
        },
      },
      guest: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!booking) return null;

  const balance = booking.folio ? Number(booking.folio.balance) : 0;
  const totalAmount = Number(booking.folio?.totalCharges || 0);

  const checkInDates = booking.rooms.map((r) => r.checkIn.getTime());
  const checkOutDates = booking.rooms.map((r) => r.checkOut.getTime());
  const checkIn = checkInDates.length ? new Date(Math.min(...checkInDates)) : new Date();
  const checkOut = checkOutDates.length ? new Date(Math.max(...checkOutDates)) : new Date();

  return {
    booking: {
      id: booking.id,
      bookingNo: booking.bookingNo,
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
      adults: booking.adults,
      children: booking.children,
      guestName: booking.guestName || booking.guest?.name || '',
      guestEmail: booking.guestEmail || booking.guest?.email || '',
      guestPhone: booking.guestPhone || booking.guest?.phone || '',
      status: booking.status,
      totalAmount,
      currency: booking.hotel?.currency || 'LYD',
    },
    hotel: {
      id: booking.hotelId,
      name: booking.hotel?.name || '',
      nameAr: booking.hotel?.nameAr || null,
      currency: booking.hotel?.currency || 'LYD',
      timezone: booking.hotel?.timezone || 'Asia/Tripoli',
    },
    balance,
    totalAmount,
  };
}

async function getVerifiedSucceededSession(bookingId: string, sessionId?: string) {
  return prisma.paymentSession.findFirst({
    where: {
      bookingId,
      status: 'SUCCEEDED',
      ...(sessionId ? { id: sessionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
    },
  });
}

function UnverifiedSuccessView({ bookingId }: { bookingId: string }) {
  const retryHref = `/booking/${bookingId}/checkout?step=success`;
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[rgba(231,76,60,0.1)] flex items-center justify-center">
          <svg className="h-10 w-10 text-[var(--red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">تعذر تأكيد حالة الدفع</h2>
        <p className="text-[var(--text-secondary)] mb-6">
          لم نجد دفعة ناجحة مرتبطة بهذا الحجز. إذا قمت بالدفع للتو، فقد يستغرق التأكيد لحظات.
        </p>
        <div className="space-y-3">
          <a
            href={retryHref}
            className="inline-flex w-full items-center justify-center px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110"
          >
            إعادة التحقق
          </a>
          <a
            href={`/booking/${bookingId}/checkout`}
            className="inline-flex w-full items-center justify-center px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] font-bold hover:border-[var(--gold)] hover:text-[var(--gold)]"
          >
            العودة لصفحة الدفع
          </a>
        </div>
      </div>
    </div>
  );
}

export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const { id: bookingId } = await params;
  const sp = await searchParams;
  const step = typeof sp?.step === 'string' ? sp.step : undefined;
  const sessionId = typeof sp?.session === 'string' ? sp.session : undefined;

  const data = await getBookingData(bookingId);

  if (!data || data.balance <= 0) {
    notFound();
  }

  if (step === 'success') {
    const session = await getVerifiedSucceededSession(bookingId, sessionId);
    if (!session) {
      return <UnverifiedSuccessView bookingId={bookingId} />;
    }
    return (
      <SuccessView
        bookingNo={data.booking.bookingNo}
        amount={session.amount}
        currency={session.currency || data.booking.currency}
      />
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <CheckoutClient
        initialBooking={data.booking}
        initialHotel={data.hotel}
        initialBalance={data.balance}
        initialTotalAmount={data.totalAmount}
        bookingId={bookingId}
      />
    </Suspense>
  );
}