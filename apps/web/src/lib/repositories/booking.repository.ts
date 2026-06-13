import { prisma } from '@/lib/utils/prisma';
import { BaseRepository } from './base.repository';

export class BookingRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.booking as any);
  }

  async findByBookingNo(bookingNo: string) {
    return prisma.booking.findUnique({
      where: { bookingNo },
      include: {
        rooms: { include: { room: true, roomCharges: true } },
        folio: true,
        guest: true,
        bookingServices: { include: { service: true } },
        payments: true,
      },
    });
  }

  async findByHotel(hotelId: string, status?: string) {
    const where: Record<string, any> = { hotelId };
    if (status) where.status = status;

    return prisma.booking.findMany({
      where: where as any,
      include: {
        rooms: { include: { room: true } },
        guest: true,
        folio: true,
      },
      orderBy: { createdAt: 'desc' } as any,
    });
  }

  async findActiveByGuest(guestId: string) {
    return prisma.booking.findMany({
      where: {
        guestId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
      } as any,
      include: {
        rooms: { include: { room: true } },
        folio: true,
      },
      orderBy: { createdAt: 'desc' } as any,
    });
  }

  async getOccupiedRooms(hotelId: string, date: Date) {
    return prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
      } as any,
      include: {
        rooms: {
          include: { room: true },
        },
        guest: true,
      },
    });
  }

  async getOccupancyReport(hotelId: string, from: Date, to: Date) {
    const bookings = await prisma.booking.findMany({
      where: {
        hotelId,
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      } as any,
      include: {
        rooms: true,
      },
    });

    const totalNights = bookings.reduce((sum, b) => {
      const rooms = (b as any).rooms || [];
      const nights = rooms.reduce((s: number, r: any) => {
        const diff = Math.ceil(
          (r.checkOut.getTime() - r.checkIn.getTime()) / (1000 * 60 * 60 * 24)
        );
        return s + diff;
      }, 0);
      return sum + nights;
    }, 0);

    const revenue = bookings.reduce((sum, b) => {
      const rooms = (b as any).rooms || [];
      return sum + rooms.reduce((s: number, r: any) => s + (r.nightlyRate || 0), 0);
    }, 0);

    return { totalBookings: bookings.length, totalNights, revenue };
  }
}
