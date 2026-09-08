import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const MAX_RESULTS = 10;

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q || q.length < 1) return errorResponse('يرجى إدخال مصطلح البحث', 400);

    const [bookingMatches, folioMatches] = await Promise.all([
      prisma.booking.findMany({
        where: {
          hotelId: user.hotelId,
          OR: [
            { bookingNo: { contains: q, mode: 'insensitive' } },
            { id: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: {
          guest: true,
          folio: true,
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_RESULTS,
      }),
      prisma.folio.findMany({
        where: {
          booking: { hotelId: user.hotelId },
          id: { contains: q, mode: 'insensitive' },
        },
        include: {
          booking: {
            include: {
              guest: true,
              folio: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_RESULTS,
      }),
    ]);

    const itemsMap = new Map<string, any>();

    bookingMatches.forEach((b) => {
      itemsMap.set(b.id, {
        bookingId: b.id,
        bookingNo: b.bookingNo,
        folioId: b.folio?.id || null,
        guestName: b.guestName || b.guest?.name || null,
        hasFolio: !!b.folio,
        createdAt: b.createdAt,
      });
    });

    folioMatches.forEach((f) => {
      if (itemsMap.has(f.booking.id)) return;
      itemsMap.set(f.booking.id, {
        bookingId: f.booking.id,
        bookingNo: f.booking.bookingNo,
        folioId: f.id,
        guestName: f.booking.guestName || f.booking.guest?.name || null,
        hasFolio: true,
        createdAt: f.booking.createdAt,
      });
    });

    const items = [...itemsMap.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_RESULTS);

    return successResponse({ items });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل البحث', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
