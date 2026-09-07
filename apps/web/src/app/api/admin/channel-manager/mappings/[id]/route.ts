import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';

const PROVIDERS = ['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'AGODA', 'TRIP', 'OTHER'];

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const existing = await prisma.channelMapping.findUnique({ where: { id: params.id } });
    if (!existing || existing.hotelId !== user.hotelId) {
      return errorResponse('الربط غير موجود', 404);
    }

    const body = await request.json();
    const data: any = {};

    if (body.provider !== undefined) {
      const provider = String(body.provider);
      if (!PROVIDERS.includes(provider)) return errorResponse('مزود القناة غير معروف', 400);
      data.provider = provider;
    }
    if (body.channelRoomTypeId !== undefined) {
      if (!String(body.channelRoomTypeId).trim()) return errorResponse('channelRoomTypeId مطلوب', 400);
      data.channelRoomTypeId = String(body.channelRoomTypeId).trim();
    }
    if (body.channelName !== undefined) {
      data.channelName = body.channelName ? String(body.channelName).trim() : null;
    }
    if (body.channelRatePlanId !== undefined) {
      data.channelRatePlanId = body.channelRatePlanId ? String(body.channelRatePlanId).trim() : null;
    }
    if (body.enabled !== undefined) {
      data.enabled = Boolean(body.enabled);
    }
    if (body.roomTypeId !== undefined) {
      const roomType = await prisma.roomType.findFirst({
        where: { id: String(body.roomTypeId), hotelId: user.hotelId },
      });
      if (!roomType) return errorResponse('نوع الغرفة المحلي غير موجود', 400);
      data.roomTypeId = roomType.id;
    }
    if (body.ratePlanId !== undefined) {
      if (body.ratePlanId) {
        const ratePlan = await prisma.ratePlan.findFirst({
          where: { id: String(body.ratePlanId), hotelId: user.hotelId },
        });
        if (!ratePlan) return errorResponse('خطة التسعير غير موجودة', 400);
        data.ratePlanId = ratePlan.id;
      } else {
        data.ratePlanId = null;
      }
    }

    const mapping = await prisma.channelMapping.update({
      where: { id: existing.id },
      data,
    });

    return successResponse(mapping);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse('يوجد ربط مكرر لنفس نوع الغرفة والقناة', 400);
    }
    return errorResponse(error.message || 'فشل تحديث الربط', 400);
  }
}

export const PATCH = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);