import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { GuestDocumentService } from '@/lib/services/guest-document.service';

const documentService = new GuestDocumentService();

// GET /api/admin/guests/[id]/documents — list guest documents
async function getHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const documents = await documentService.listDocuments(params.id, user.hotelId);
    return successResponse(documents);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب الوثائق', 400);
  }
}

// POST /api/admin/guests/[id]/documents — secure upload (private storage)
async function postHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = String(formData.get('documentType') || '');

    if (!file || file.size === 0) return errorResponse('الملف مطلوب', 400);

    const buffer = Buffer.from(await file.arrayBuffer());

    const document = await documentService.uploadDocument({
      guestId: params.id,
      hotelId: user.hotelId,
      uploadedById: user.userId,
      documentType,
      file: {
        name: file.name,
        declaredType: file.type,
        size: file.size,
        buffer,
      },
    });

    return successResponse(document, 201);
  } catch (error: any) {
    if (error instanceof AppError) return errorResponse(error.message, error.statusCode);
    return errorResponse(error.message || 'فشل رفع الوثيقة', 400);
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER', 'RECEPTION']);
export const POST = withAuth(withCsrf(withRateLimit(postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION']);
