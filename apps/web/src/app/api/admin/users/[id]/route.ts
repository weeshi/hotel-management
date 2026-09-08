import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { hashPassword } from '@/lib/utils/password';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAuditLog } from '@/lib/services';

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUser = (request as any).user;
    const body = await request.json();
    const data: any = {};

    if (body.name) data.name = body.name;
    if (body.email) data.email = body.email;
    if (body.role) data.role = body.role;
    if (body.password) data.password = await hashPassword(body.password);

    const result = await prisma.user.updateMany({
      where: { id: params.id, hotelId: currentUser.hotelId },
      data,
    });
    if (result.count === 0) return errorResponse('المستخدم غير موجود', 404);

    const updatedUser = await prisma.user.findFirst({
      where: { id: params.id, hotelId: currentUser.hotelId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!updatedUser) return errorResponse('المستخدم غير موجود', 404);

    createAuditLog({
      hotelId: currentUser.hotelId,
      userId: currentUser.userId,
      action: 'UPDATE',
      entity: 'USER',
      entityId: updatedUser.id,
      newValue: JSON.stringify({ name: updatedUser.name, email: updatedUser.email, role: updatedUser.role }),
    });

    return successResponse(updatedUser);
  } catch (error: any) {
    if (error.code === 'P2002') return errorResponse('البريد الإلكتروني مستخدم مسبقاً', 409);
    if (error.code === 'P2025') return errorResponse('المستخدم غير موجود', 404);
    return errorResponse(error.message || 'فشل تحديث المستخدم');
  }
}

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUser = (request as any).user;
    const user = await prisma.user.findFirst({
      where: { id: params.id, hotelId: currentUser.hotelId },
    });
    if (!user) return errorResponse('المستخدم غير موجود', 404);

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { isActive: !user.isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    createAuditLog({
      hotelId: currentUser.hotelId,
      userId: currentUser.userId,
      action: 'TOGGLE_ACTIVE',
      entity: 'USER',
      entityId: user.id,
      oldValue: JSON.stringify({ isActive: user.isActive }),
      newValue: JSON.stringify({ isActive: updated.isActive }),
    });

    return successResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تغيير حالة المستخدم');
  }
}

export const PUT = withAuth(withCsrf(putHandler), ['ADMIN']);
export const PATCH = withAuth(withCsrf(patchHandler), ['ADMIN']);
