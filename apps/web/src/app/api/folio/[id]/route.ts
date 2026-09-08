import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const folioService = new FolioService();

async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const folio = await folioService.getFolioSummary(params.id, user.hotelId);
    return successResponse(folio);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الفاتورة', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'ACCOUNTANT']);
