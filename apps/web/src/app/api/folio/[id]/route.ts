import { NextRequest } from 'next/server';
import { FolioService } from '@/lib/services/folio.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const folioService = new FolioService();

async function getHandler(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const folio = await folioService.getFolioSummary(params.id);
    return successResponse(folio);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الفاتورة', error.statusCode || 400);
  }
}

export const GET = withAuth(getHandler);
