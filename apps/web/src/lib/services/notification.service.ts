import { prisma } from '@/lib/utils/prisma';
import { queueService } from '@/lib/queue';
import { buildBookingTemplate } from '@/lib/gateways/email.gateway';

interface CreateNotificationParams {
  hotelId: string;
  bookingId?: string;
  type: string;
  event: string;
  recipient: string;
  subject?: string;
  body?: string;
}

interface SendBookingNotificationParams {
  hotelId: string;
  bookingId: string;
  type: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PAYMENT_RECEIVED' | 'REMINDER_24H';
  guestEmail?: string;
  guestName?: string;
  bookingNo?: string;
  checkIn?: string;
  checkOut?: string;
  roomNumbers?: string[];
  totalAmount?: number;
}

export async function createNotification(params: CreateNotificationParams) {
  const notification = await prisma.notification.create({ data: params });

  if (params.recipient && params.recipient.includes('@')) {
    await queueService.add({
      type: 'SEND_EMAIL',
      data: {
        hotelId: params.hotelId,
        bookingId: params.bookingId,
        recipient: params.recipient,
        subject: params.subject || '',
        body: params.body || '',
      },
    });
  }

  return notification;
}

export async function sendBookingNotification(params: SendBookingNotificationParams) {
  if (!params.guestEmail && !params.guestName) {
    const booking = await prisma.booking.findUnique({
      where: { id: params.bookingId },
      select: { guestEmail: true, guestName: true },
    });
    if (!booking) return;
    params.guestEmail = booking.guestEmail || undefined;
    params.guestName = booking.guestName || undefined;
  }

  if (!params.guestEmail) return;

  const hotel = await prisma.hotel.findUnique({
    where: { id: params.hotelId },
    select: { name: true, nameAr: true },
  });

  const { subject, html } = buildBookingTemplate(params.type, {
    guestName: params.guestName,
    bookingNo: params.bookingNo,
    hotelName: hotel?.nameAr || hotel?.name || 'الفندق',
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    roomNumbers: params.roomNumbers,
    totalAmount: params.totalAmount,
  });

  await createNotification({
    hotelId: params.hotelId,
    bookingId: params.bookingId,
    type: params.type,
    event: params.type.toLowerCase().replace(/_/g, '.'),
    recipient: params.guestEmail,
    subject,
    body: html,
  });

  await createNotification({
    hotelId: params.hotelId,
    bookingId: params.bookingId,
    type: params.type,
    event: params.type.toLowerCase().replace(/_/g, '.'),
    recipient: 'RECEPTION',
    subject: `${subject} — إشعار داخلي`,
    body: `تم إرسال إشعار ${params.type} للنزيل ${params.guestName}`,
  });
}
