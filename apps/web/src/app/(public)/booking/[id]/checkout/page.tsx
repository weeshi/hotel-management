import { Suspense } from 'react';
import { prismaPlatform } from '@/lib/utils/prisma';
import { notFound } from 'next/navigation';
import { CheckoutClient } from './CheckoutClient';
import { SuccessView } from './components/SuccessView';
import { UnverifiedSuccessView } from './components/UnverifiedSuccessView';

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
  const booking = await prismaPlatform.booking.findUnique({
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
  return prismaPlatform.paymentSession.findFirst({
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

export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const { id: bookingId } = await params;
  const sp = await searchParams;
  const step = typeof sp?.step === 'string' ? sp.step : undefined;
  const sessionId = typeof sp?.session === 'string' ? sp.session : undefined;

  const data = await getBookingData(bookingId);

  if (!data) {
    notFound();
  }

  if (step === 'success') {
    const session = await getVerifiedSucceededSession(bookingId, sessionId);
    if (!session) {
      const latestSession = await prismaPlatform.paymentSession.findFirst({
        where: { bookingId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return <UnverifiedSuccessView bookingId={bookingId} sessionId={latestSession?.id} />;
    }
    return (
      <SuccessView
        bookingNo={data.booking.bookingNo}
        amount={session.amount}
        currency={session.currency || data.booking.currency}
      />
    );
  }

  if (data.balance <= 0) {
    notFound();
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