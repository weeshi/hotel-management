import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
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

    const transaction = await folioService.addCharge(params.id, user.hotelId, {
      description: body.description,
      amount: body.amount,
      category: body.category,
      createdById: user.userId,
    });

    const folio = await prisma.folio.findFirst({ where: { id: params.id, booking: { hotelId: user.hotelId } }, include: { booking: true } });

    createAuditLog({
      hotelId: user.hotelId,
      userId: user.userId,
      action: 'CHARGE',
      entity: 'FOLIO',
      entityId: params.id,
      newValue: JSON.stringify({ amount: body.amount, description: body.description, category: body.category }),
    });

    return successResponse(transaction, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة الرسوم', error.statusCode || 400);
  }
}

export const POST = withAuth(withCsrf(postHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
