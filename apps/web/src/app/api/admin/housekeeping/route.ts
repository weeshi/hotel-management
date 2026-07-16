import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createHousekeepingSchema } from '@hotel/shared';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const roomId = searchParams.get('roomId') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const taskType = searchParams.get('taskType') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;
    if (roomId) where.roomId = roomId;
    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;

    const tasks = await prisma.housekeepingTask.findMany({
      where,
      include: {
        room: {
          include: { roomType: true },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    tasks.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    return successResponse(tasks);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ظ…ظ‡ط§ظ… ط§ظ„طھط¯ط¨ظٹط± ط§ظ„ظ…ظ†ط²ظ„ظٹ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const task = await prisma.housekeepingTask.create({
      data: {
        hotelId: user.hotelId,
        roomId: body.roomId,
        taskType: body.taskType,
        priority: body.priority,
        assignedTo: body.assignedTo,
        notes: body.notes,
      },
      include: {
        room: { include: { roomType: true } },
      },
    });
    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ظ‡ظ…ط©');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE']);
export const POST = withAuth(withCsrf(withValidation(createHousekeepingSchema, postHandler)), ['ADMIN', 'MANAGER', 'HOUSEKEEPING', 'MAINTENANCE']);
