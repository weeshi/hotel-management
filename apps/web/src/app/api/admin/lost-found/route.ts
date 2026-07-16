import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { createLostItemSchema } from '@hotel/shared';

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const roomId = searchParams.get('roomId') || undefined;

    const where: any = { hotelId: user.hotelId };
    if (status) where.status = status;
    if (roomId) where.roomId = roomId;

    const items = await prisma.lostItem.findMany({
      where,
      include: {
        room: { select: { roomNumber: true, floor: true } },
        foundBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(items);
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¬ظ„ط¨ ط§ظ„ظ…ظپظ‚ظˆط¯ط§طھ');
  }
}

async function postHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;

    const item = await prisma.lostItem.create({
      data: {
        hotelId: user.hotelId,
        roomId: body.roomId,
        description: body.description,
        locationFound: body.locationFound,
        imageUrl: body.imageUrl,
        notes: body.notes,
        foundById: user.userId,
      },
      include: {
        room: { select: { roomNumber: true, floor: true } },
        foundBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط³ط¬ظ„ ط§ظ„ظ…ظپظ‚ظˆط¯ط§طھ');
  }
}

export const GET = withAuth(getHandler, ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'RESTAURANT', 'ACCOUNTANT']);
export const POST = withAuth(withCsrf(withValidation(createLostItemSchema, postHandler)), ['ADMIN', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING']);
