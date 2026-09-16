import { Suspense } from 'react';
import { prisma } from '@/lib/utils/prisma';
import { notFound } from 'next/navigation';
import { CheckoutClient } from './CheckoutClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: 'إتمام الدفع - نظام إدارة الفنادق',
    description: 'صفحة الدفع الآمنة لحجزك الفندقي',
  };
}

async function getBookingData(bookingId: string) {
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

export default async function CheckoutPage({ params }: PageProps) {
  const { id: bookingId } = await params;

  const data = await getBookingData(bookingId);

  if (!data || data.balance <= 0) {
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