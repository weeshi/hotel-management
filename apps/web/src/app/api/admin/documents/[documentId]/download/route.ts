import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middlewares/auth';
import { errorResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { GuestDocumentService } from '@/lib/services/guest-document.service';

const documentService = new GuestDocumentService();

// GET /api/admin/documents/[documentId]/download — served from PRIVATE storage only
async function getHandler(request: NextRequest, { params }: { params: { documentId: string } }) {
  try {
    const user = (request as any).user;
    const { document, buffer } = await documentService.downloadDocument(params.documentId, user.hotelId);

    const safeFileName = document.fileName.replace(/[^\w.\- ]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': document.fileMimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
    return errorResponse(error.message || 'فشل استرجاع الوثيقة', 400);
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
