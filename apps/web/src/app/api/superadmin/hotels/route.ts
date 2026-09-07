import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { InvitationService } from '@/lib/services/invitation.service';
import { createHotelInvitationSchema } from '@hotel/shared';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { buildInvitationLink } from '@/lib/utils/invitation-link';

const invitationService = new InvitationService();

// --- GET /api/superadmin/hotels ---
// Lists every tenant with its customDomain, creation date and onboarding stats
// (user + invitation counts) so the Super-Admin dashboard needs no extra calls.

async function getHandler(request: NextRequest) {
  try {
    const hotels = await prisma.hotel.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        nameAr: true,
        customDomain: true,
        createdAt: true,
        currency: true,
        _count: { select: { users: true } },
      },
    });

    const invitationCounts = await prisma.invitation.groupBy({
      by: ['hotelId'],
      where: { isUsed: false },
      _count: { _all: true },
    });
    const pendingByHotel = new Map(
      invitationCounts.map((row) => [row.hotelId, row._count._all])
    );

    const data = hotels.map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      nameAr: hotel.nameAr,
      customDomain: hotel.customDomain,
      createdAt: hotel.createdAt,
      currency: hotel.currency,
      usersCount: hotel._count.users,
      invitationsPending: pendingByHotel.get(hotel.id) || 0,
    }));

    return successResponse(data);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الفنادق', 500);
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const validated = createHotelInvitationSchema.parse(body);

    const result = await invitationService.createHotelWithInvitation({
      hotel: validated.hotel,
      manager: validated.manager,
      createdById: user.userId,
    });

    // Invitation links always point at the main SaaS base URL — never at the
    // brand-new customDomain — so they work even while DNS/Cloudflare is still
    // propagating. The customDomain is carried only as informational context.
    const invitationLink = buildInvitationLink(result.token, {
      customDomain: validated.hotel.customDomain,
      origin: request.nextUrl?.origin,
    });

    return successResponse(
      {
        hotel: result.hotel,
        invitation: result.invitation,
        invitationLink,
      },
      201
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return errorResponse('بيانات غير صالحة', 422);
    }
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return errorResponse(error.message, error.statusCode || 400);
    }
    return errorResponse(error.message || 'فشل إنشاء الفندق', 400);
  }
}

export const GET = withAuth(getHandler, ['SUPER_ADMIN']);
export const POST = withAuth(withCsrf(postHandler), ['SUPER_ADMIN']);
