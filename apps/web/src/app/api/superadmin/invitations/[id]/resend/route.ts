import { NextRequest } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { createAuditLog } from '@/lib/services/audit.service';
import { buildInvitationLink } from '@/lib/utils/invitation-link';

const INVITATION_TTL_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// --- POST /api/superadmin/invitations/[id]/resend ---
// Regenerates the raw token + expiry for a PENDING (unused) invitation so a
// stale/expired link can be refreshed. The old hash is replaced — the previous
// link stops working. Returns the fresh SaaS-based link.

async function resendHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { id: params.id },
      include: { hotel: { select: { id: true, customDomain: true } } },
    });
    if (!invitation) throw new NotFoundError('الدعوة غير موجودة');
    if (invitation.isUsed) throw new ValidationError('لا يمكن إعادة إرسال دعوة مستخدمة');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const updated = await prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hashToken(token), expiresAt },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    await createAuditLog({
      hotelId: invitation.hotel.id,
      userId: (request as any).user.userId,
      action: 'INVITATION_RESENT',
      entity: 'INVITATION',
      entityId: invitation.id,
      oldValue: JSON.stringify({ expiresAt: invitation.expiresAt }),
      newValue: JSON.stringify({ expiresAt }),
    });

    const invitationLink = buildInvitationLink(token, {
      customDomain: invitation.hotel.customDomain,
      origin: request.nextUrl?.origin,
    });

    return successResponse({ ...updated, invitationLink }, 200);
  } catch (error: any) {
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return errorResponse(error.message, error.statusCode || 400);
    }
    return errorResponse(error.message || 'فشل إعادة إرسال الدعوة', 400);
  }
}

export const POST = withAuth(withCsrf(withRateLimit(resendHandler)), ['SUPER_ADMIN']);
