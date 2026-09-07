import { prisma } from '@/lib/utils/prisma';
import { BaseRepository } from './base.repository';

export class GuestRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.guest);
  }

  async searchGuests(params: {
    query?: string;
    nationality?: string;
    hotelId: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { query, nationality, hotelId, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const where: any = { hotelId };

    if (query) {
      where.OR = [
        { name: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
        { idNumber: { contains: query } },
      ];
    }
    if (nationality) where.nationality = nationality;

    return this.paginate({
      where,
      include: {
        _count: { select: { bookings: true } },
        wallets: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 1 } } },
        bookings: { where: { hotelId }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { [sortBy]: sortOrder },
      page,
      limit,
    });
  }

  async quickSearch(query: string, hotelId: string, take = 10) {
    return prisma.guest.findMany({
      where: {
        hotelId,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
          { phone: { contains: query } },
        ],
      },
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdWithRelations(id: string, hotelId: string) {
    return prisma.guest.findFirst({
      where: { id, hotelId },
      include: {
        wallets: {
          where: { hotelId },
          include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
        },
        bookings: {
          where: { hotelId },
          orderBy: { createdAt: 'desc' },
          include: {
            rooms: { include: { room: true } },
            safeDepositBoxes: {
              include: {
                package: { select: { name: true } },
                items: true,
              },
            },
            folio: {
              include: {
                transactions: { orderBy: { createdAt: 'asc' } },
                payments: true,
                discounts: true,
              },
            },
          },
        },
      },
    });
  }

  async findByHotel(id: string, hotelId: string) {
    return prisma.guest.findFirst({ where: { id, hotelId } });
  }

  async findByEmail(email: string, hotelId: string) {
    return prisma.guest.findFirst({ where: { email, hotelId } });
  }
}
