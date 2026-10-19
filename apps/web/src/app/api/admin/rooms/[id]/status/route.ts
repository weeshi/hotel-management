import { NextRequest } from 'next/server';
import { prisma, tenantTx } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { updateRoomStatusSchema } from '@hotel/shared';

async function patchHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const roomId = params.id;

    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId: user.hotelId },
    });
    if (!room) return errorResponse('الغرفة غير موجودة', 404);

    const updateData: Record<string, string> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.housekeepingStatus !== undefined) updateData.housekeepingStatus = body.housekeepingStatus;

    const triggersCleaningTask =
      body.housekeepingStatus === 'DIRTY' && room.housekeepingStatus !== 'DIRTY';

    const updatedRoom = await tenantTx(async (tx) => {
      const updated = await tx.room.update({
        where: { id: roomId },
        data: updateData,
      });

      if (triggersCleaningTask) {
        const existingTask = await tx.housekeepingTask.findFirst({
          where: {
            roomId,
            taskType: 'CLEANING',
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        });

        if (!existingTask) {
          await tx.housekeepingTask.create({
            data: {
              hotelId: user.hotelId,
              roomId,
              taskType: 'CLEANING',
              priority: 'NORMAL',
              status: 'PENDING',
            },
          });
        }
      }

      return updated;
    });

    return successResponse(updatedRoom);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث حالة الغرفة');
  }
}

export const PATCH = withAuth(withCsrf(withValidation(updateRoomStatusSchema, patchHandler)), [
  'ADMIN',
  'MANAGER',
  'RECEPTION',
  'HOUSEKEEPING',
]);
