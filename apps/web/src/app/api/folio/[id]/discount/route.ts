import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

const folioService = new FolioService();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const result = await folioService.applyDiscount(params.id, user.hotelId, {
      type: body.type,
      value: body.value,
      reason: body.reason,
      createdById: user.userId,
      userRole: user.role,
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'DISCOUNT',
      entity: 'FOLIO',
      entityId: params.id,
      newValue: JSON.stringify({ type: body.type, value: body.value, reason: body.reason }),
    });

    return successResponse(result, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تطبيق الخصم', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER']);
