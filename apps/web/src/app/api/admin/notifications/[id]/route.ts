import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
    });
    if (!notification) return errorResponse('الإشعار غير موجود', 404);

    const updated = await prisma.notification.update({
      where: { id: params.id },
      data: { status: 'READ', sentAt: new Date() },
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث الإشعار');
  }
}

export const PUT = withAuth(putHandler, ['ADMIN', 'MANAGER', 'RECEPTION']);
