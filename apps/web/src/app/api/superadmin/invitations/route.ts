import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withPlatformAuth } from '@/middlewares/platform-auth';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

// --- GET /api/superadmin/invitations ---
// Lists all invitations (pending, expired and used) with hotel + creator
// context, newest first. Status is computed on the fly from isUsed/expiresAt.

async function getHandler() {
  try {
    const invitations = await prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        hotel: { select: { id: true, name: true, customDomain: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const now = new Date();
    const data = invitations.map((invitation) => {
      const status = invitation.isUsed
        ? 'USED'
        : invitation.expiresAt < now
          ? 'EXPIRED'
          : 'PENDING';

      return {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status,
        isUsed: invitation.isUsed,
        usedAt: invitation.usedAt,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        hotel: invitation.hotel,
        createdBy: invitation.createdBy,
      };
    });

    return successResponse(data);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الدعوات', 500);
  }
}

export const GET = withPlatformAuth(withRateLimit(getHandler, 60));
