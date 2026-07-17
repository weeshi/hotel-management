import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { errorResponse } from '@/lib/utils/api-response';
import { BookingService } from '@/lib/services/booking.service';

const bookingService = new BookingService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const roomType = await prisma.roomType.findUnique({
      where: { id: body.roomTypeId },
    });
    if (!roomType) return errorResponse('ظ†ظˆط¹ ط§ظ„ط؛ط±ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯', 404);

    const availableRoom = await prisma.room.findFirst({
      where: {
        roomTypeId: body.roomTypeId,
        hotelId: 'default-hotel',
        status: 'AVAILABLE',
      },
    });
    if (!availableRoom) return errorResponse('ظ„ط§ طھظˆط¬ط¯ ط؛ط±ظپ ظ…طھط§ط­ط© ظ…ظ† ظ‡ط°ط§ ط§ظ„ظ†ظˆط¹', 400);

    const booking = await bookingService.create({
      hotelId: 'default-hotel',
      guestName: body.name,
      guestEmail: body.email,
      guestPhone: body.phone,
      adults: body.adults || 1,
      children: body.children || 0,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      rooms: [{
        roomId: availableRoom.id,
        nightlyRate: roomType.baseRate,
      }],
      source: 'WEBSITE',
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط­ط¬ط²', 400);
  }
}
