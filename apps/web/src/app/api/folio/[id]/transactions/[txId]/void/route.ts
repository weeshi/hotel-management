import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

const folioService = new FolioService();

async function postHandler(request: NextRequest, { params }: { params: { id: string; txId: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    if (!body.reason) {
      return errorResponse('سبب الإلغاء مطلوب', 400);
    }

    const result = await folioService.voidTransaction(params.id, params.txId, user.hotelId, {
      reason: body.reason,
      createdById: user.userId,
    });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'VOID_TRANSACTION',
      entity: 'FOLIO',
      entityId: params.id,
      newValue: JSON.stringify({ transactionId: params.txId, reason: body.reason }),
    });

    return successResponse(result, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إلغاء المعاملة', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
