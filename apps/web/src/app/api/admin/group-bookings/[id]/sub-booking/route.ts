import { NextRequest, NextResponse } from 'next/server';
import { BookingService } from '@/lib/services/booking.service';
import { GroupBookingService } from '@/lib/services/group-booking.service';
import { withAuth } from '@/middlewares/auth';
import { errorResponse } from '@/lib/utils/api-response';

const bookingService = new BookingService();
const groupBookingService = new GroupBookingService();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const groupId = params.id;

    const booking = await bookingService.create({
      hotelId: user.hotelId,
      guestName: body.guestName,
      guestPhone: body.guestPhone,
      adults: body.adults,
      children: body.children,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      rooms: [{ roomId: body.roomId, nightlyRate: body.nightlyRate }],
      source: 'RECEPTION',
    });

    await groupBookingService.assignBookings({
      groupId,
      hotelId: user.hotelId,
      bookingIds: [booking.id],
      createdById: user.userId,
    });

    const group = await groupBookingService.getById(groupId, user.hotelId);

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الحجز الفرعي', error.statusCode || 400);
  }
}

export const POST = withAuth(postHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
