import { GuestRepository } from '@/lib/repositories/guest.repository';
import { prisma } from '@/lib/utils/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

const guestRepo = new GuestRepository();

export class GuestService {

  async list(params: {
    query?: string;
    nationality?: string;
    hotelId: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const result = await guestRepo.searchGuests(params);
    if (result.data) {
      result.data = result.data.map((g: any) => ({
        ...g,
        wallet: g.wallets?.[0] || null,
        wallets: undefined,
      }));
    }
    return result;
  }

  async quickSearch(query: string, hotelId: string) {
    if (!query || query.length < 2) return [];
    return guestRepo.quickSearch(query, hotelId);
  }

  async getById(id: string, hotelId: string) {
    const guest = await guestRepo.findByIdWithRelations(id, hotelId);
    if (!guest) throw new NotFoundError('النزيل غير موجود');
    return {
      ...guest,
      wallet: guest.wallets?.[0] || null,
      wallets: undefined,
    };
  }

  async create(data: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    nationality?: string;
    idNumber?: string;
    notes?: string;
    idDocumentUrl?: string;
  }, hotelId: string) {
    const sanitized = {
      name: data.name,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      address: data.address?.trim() || undefined,
      nationality: data.nationality?.trim() || undefined,
      idNumber: data.idNumber?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      idDocumentUrl: data.idDocumentUrl?.trim() || undefined,
      hotelId,
    };

    if (sanitized.email) {
      const existing = await guestRepo.findByEmail(sanitized.email, hotelId);
      if (existing) throw new ValidationError('البريد الإلكتروني مستخدم بالفعل، يرجى إدخال بريد مختلف');
    }
    if (sanitized.phone) {
      const existing = await prisma.guest.findFirst({ where: { phone: sanitized.phone, hotelId } });
      if (existing) throw new ValidationError('رقم الهاتف مستخدم بالفعل، يرجى إدخال رقم مختلف');
    }
    if (sanitized.idNumber) {
      const existing = await prisma.guest.findFirst({ where: { idNumber: sanitized.idNumber, hotelId } });
      if (existing) throw new ValidationError('رقم الهوية مستخدم بالفعل، يرجى إدخال رقم مختلف');
    }

    try {
      const result = await guestRepo.create(sanitized);
      return result;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target: string[] = error.meta?.target ?? [];
        if (target.includes('phone')) throw new ValidationError('رقم الهاتف مستخدم بالفعل، يرجى إدخال رقم مختلف');
        if (target.includes('idNumber')) throw new ValidationError('رقم الهوية مستخدم بالفعل، يرجى إدخال رقم مختلف');
        if (target.includes('email')) throw new ValidationError('البريد الإلكتروني مستخدم بالفعل، يرجى إدخال بريد مختلف');
      }
      throw error;
    }
  }

  async update(id: string, hotelId: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    nationality?: string;
    idNumber?: string;
    notes?: string;
    allowCredit?: boolean;
    idDocumentUrl?: string;
  }) {
    const sanitized: Record<string, any> = {
      ...data,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      address: data.address?.trim() || undefined,
      nationality: data.nationality?.trim() || undefined,
      idNumber: data.idNumber?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    };
    if (data.allowCredit === undefined) delete sanitized.allowCredit;
    if (data.idDocumentUrl !== undefined) sanitized.idDocumentUrl = data.idDocumentUrl || undefined;

    const guest = await guestRepo.findByHotel(id, hotelId);
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    if (sanitized.email && sanitized.email !== guest.email) {
      const existing = await guestRepo.findByEmail(sanitized.email, hotelId);
      if (existing) throw new ValidationError('البريد الإلكتروني مستخدم بالفعل، يرجى إدخال بريد مختلف');
    }
    if (sanitized.phone && sanitized.phone !== guest.phone) {
      const existing = await prisma.guest.findFirst({ where: { phone: sanitized.phone, hotelId } });
      if (existing) throw new ValidationError('رقم الهاتف مستخدم بالفعل، يرجى إدخال رقم مختلف');
    }
    if (sanitized.idNumber && sanitized.idNumber !== guest.idNumber) {
      const existing = await prisma.guest.findFirst({ where: { idNumber: sanitized.idNumber, hotelId } });
      if (existing) throw new ValidationError('رقم الهوية مستخدم بالفعل، يرجى إدخال رقم مختلف');
    }

    try {
      return guestRepo.update(id, sanitized);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target: string[] = error.meta?.target ?? [];
        if (target.includes('phone')) throw new ValidationError('رقم الهاتف مستخدم بالفعل، يرجى إدخال رقم مختلف');
        if (target.includes('idNumber')) throw new ValidationError('رقم الهوية مستخدم بالفعل، يرجى إدخال رقم مختلف');
        if (target.includes('email')) throw new ValidationError('البريد الإلكتروني مستخدم بالفعل، يرجى إدخال بريد مختلف');
      }
      throw error;
    }
  }

  async remove(id: string, hotelId: string) {
    const guest = await guestRepo.findByHotel(id, hotelId);
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    const activeStatuses = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
    const activeBookings = await prisma.booking.count({
      where: { guestId: id, hotelId, status: { in: activeStatuses } },
    });
    if (activeBookings > 0) {
      throw new ValidationError('لا يمكن حذف نزيل لديه حجوزات نشطة');
    }

    return guestRepo.delete(id);
  }

  async getWallet(guestId: string, hotelId: string) {
    const guest = await guestRepo.findByHotel(guestId, hotelId);
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    let wallet = await prisma.wallet.findUnique({
      where: { guestId_hotelId: { guestId, hotelId } },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { guestId, hotelId },
        include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
      });
    }

    return wallet;
  }

  async getFolios(guestId: string, hotelId: string) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, hotelId },
      include: {
        bookings: {
          where: { hotelId },
          include: {
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
    if (!guest) throw new NotFoundError('النزيل غير موجود');

    const bookings = guest.bookings as any[];
    return bookings
      .filter((b: any) => b.folio)
      .map((b: any) => ({
        bookingId: b.id,
        bookingNo: b.bookingNo,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
        folio: b.folio,
      }));
  }

  async findOrCreateFromBooking(data: {
    name: string;
    email?: string;
    phone?: string;
  }, hotelId: string) {
    if (data.email) {
      const existing = await guestRepo.findByEmail(data.email, hotelId);
      if (existing) return existing;
    }
    if (data.phone) {
      const existing = await prisma.guest.findFirst({ where: { phone: data.phone, hotelId } });
      if (existing) return existing;
    }

    return guestRepo.create({ name: data.name, email: data.email, phone: data.phone, hotelId });
  }
}
