import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const folioService = new FolioService();

async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = await request.json();

    const transaction = await folioService.addCharge(params.id, {
      description: body.description,
      amount: body.amount,
      category: body.category,
      createdById: user.userId,
    });

    return successResponse(transaction, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إضافة الرسوم', error.statusCode || 400);
  }
}

export const POST = withAuth(postHandler);
