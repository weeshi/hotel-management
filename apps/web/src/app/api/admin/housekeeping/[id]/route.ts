import { NextRequest } from 'next/server';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { updateHousekeepingSchema } from '@hotel/shared';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

async function putHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const existing = await prisma.housekeepingTask.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('المهمة غير موجودة', 404);

    // --- State machine transition guards ---
    if (body.status !== undefined) {
      const allowedNext = VALID_TRANSITIONS[existing.status];
      if (!allowedNext || !allowedNext.includes(body.status)) {
        return errorResponse(
          `لا يمكن تغيير الحالة من ${existing.status} إلى ${body.status}`,
          422,
        );
      }

      if (body.status === 'IN_PROGRESS') {
        const effectiveAssignee = body.assignedTo ?? existing.assignedTo;
        if (!effectiveAssignee) {
          return errorResponse('يجب تعيين موظف قبل بدء المهمة', 422);
        }
      }
    }

    // --- Build update payload ---
    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.taskType !== undefined) data.taskType = body.taskType;
    if (body.status === 'COMPLETED') data.completedAt = new Date();

    // --- Atomic transaction: task update + optional room sync ---
    const task = await tenantTx(async (tx) => {
      const updated = await tx.housekeepingTask.update({
        where: { id: params.id },
        data,
        include: { room: { include: { roomType: true } } },
      });

      if (body.status === 'COMPLETED' && existing.taskType === 'CLEANING') {
        await tx.room.update({
          where: { id: existing.roomId },
          data: { housekeepingStatus: 'CLEAN' },
        });
      }

      return updated;
    });

    return successResponse(task);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث المهمة');
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const existing = await prisma.housekeepingTask.findFirst({
      where: { id: params.id, hotelId: user.hotelId },
    });
    if (!existing) return errorResponse('المهمة غير موجودة', 404);

    await prisma.housekeepingTask.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حذف المهمة');
  }
}

export const PUT = withAuth(withCsrf(withValidation(updateHousekeepingSchema, putHandler)), ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE']);
export const DELETE = withAuth(withCsrf(deleteHandler), ['ADMIN', 'MANAGER']);
