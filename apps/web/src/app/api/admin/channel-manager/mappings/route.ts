import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';

const channelService = new ChannelManagerService();
const PROVIDERS = ['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'AGODA', 'TRIP', 'OTHER'];

function serializeMapping(m: any) {
  return {
    id: m.id,
    hotelId: m.hotelId,
    provider: m.provider,
    channelRoomTypeId: m.channelRoomTypeId,
    channelRatePlanId: m.channelRatePlanId,
    channelName: m.channelName,
    roomTypeId: m.roomTypeId,
    roomTypeName: m.roomType?.name,
    roomTypeNameAr: m.roomType?.nameAr,
    ratePlanId: m.ratePlanId,
    ratePlanName: m.ratePlan?.name ?? m.ratePlan?.nameAr,
    enabled: m.enabled,
    lastPushedAt: m.lastPushedAt,
    createdAt: m.createdAt,
  };
}

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const hotelId = user.hotelId;

    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url);
      const provider = searchParams.get('provider');
      const name = searchParams.get('name');

      const where: any = { hotelId };
      if (provider) where.provider = provider;
      if (name) where.channelName = { contains: name };

      const mappings = await prisma.channelMapping.findMany({
        where,
        include: { roomType: true, ratePlan: true },
        orderBy: { updatedAt: 'desc' },
      });
      return successResponse(mappings.map(serializeMapping));
    }

    const body = await request.json();

    const provider = String(body.provider || '');
    if (!PROVIDERS.includes(provider)) {
      return errorResponse('مزود القناة غير معروف', 400);
    }
    if (!body.channelRoomTypeId || !body.roomTypeId) {
      return errorResponse('channelRoomTypeId و roomTypeId مطلوبان', 400);
    }

    const roomType = await prisma.roomType.findFirst({
      where: { id: String(body.roomTypeId), hotelId },
    });
    if (!roomType) {
      return errorResponse('نوع الغرفة المحلي غير موجود', 400);
    }

    let ratePlanId: string | null = null;
    if (body.ratePlanId) {
      const ratePlan = await prisma.ratePlan.findFirst({
        where: { id: String(body.ratePlanId), hotelId },
      });
      if (!ratePlan) {
        return errorResponse('خطة التسعير غير موجودة', 400);
      }
      ratePlanId = ratePlan.id;
    }

    const mapping = await prisma.channelMapping.upsert({
      where: {
        hotelId_roomTypeId_channelRoomTypeId: {
          hotelId,
          roomTypeId: String(body.roomTypeId),
          channelRoomTypeId: String(body.channelRoomTypeId),
        },
      },
      update: {
        provider: provider as any,
        channelRatePlanId: body.channelRatePlanId ?? null,
        channelName: body.channelName ?? null,
        ratePlanId,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      },
      create: {
        hotelId,
        provider: provider as any,
        channelRoomTypeId: String(body.channelRoomTypeId),
        channelRatePlanId: body.channelRatePlanId ?? null,
        channelName: body.channelName ?? null,
        roomTypeId: String(body.roomTypeId),
        ratePlanId,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      },
      include: { roomType: true, ratePlan: true },
    });

    return successResponse(serializeMapping(mapping), request.method === 'POST' ? 201 : 200);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حفظ ربط القناة', 400);
  }
}

async function previewHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'BOOKING_COM';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return errorResponse('from و to مطلوبان (YYYY-MM-DD)', 400);
    }

    const context = await channelService.buildAvailabilitySnapshot(
      user.hotelId,
      provider,
      new Date(from + 'T00:00:00'),
      new Date(to + 'T00:00:00')
    );

    return successResponse(
      context.snapshots.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        roomTypeId: s.roomTypeId,
        available: s.available,
        nightlyRate: s.nightlyRate,
      }))
    );
  } catch (e: any) {
    return errorResponse(e.message || 'فشل توليد التوفر', 400);
  }
}

async function publishHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = await request.json();
    const provider = String(body.provider || 'BOOKING_COM');
    const from = body.from ? new Date(String(body.from) + 'T00:00:00') : new Date();
    const to = body.to ? new Date(String(body.to) + 'T00:00:00') : new Date(Date.now() + 7 * 86400000);

    const context = await channelService.buildAvailabilitySnapshot(user.hotelId, provider, from, to);
    await channelService.storeSnapshots(user.hotelId, provider, context.snapshots);

    return successResponse({
      published: context.snapshots.length,
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    });
  } catch (e: any) {
    return errorResponse(e.message || 'فشل نشر التوفر', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);
export const PATCH = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);