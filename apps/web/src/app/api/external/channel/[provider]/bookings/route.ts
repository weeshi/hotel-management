import { NextRequest } from 'next/server';
import { withApiKeyAuth, getApiKey } from '@/middlewares/api-key-auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';

// Inbound OTA webhook — a channel manager pushes a confirmed/cancelled booking.
// Auth: a channel-manager API key (PartnerType CHANNEL_MANAGER) is required, so
// only a key issued for the right purpose can post here. The key resolves the
// tenant; the body's channelRoomTypeId is mapped to the local RoomType via
// ChannelMapping inside ChannelManagerService.

const channelService = new ChannelManagerService();

async function handler(request: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const apiKey = getApiKey(request);

    if (!apiKey.hotelId) {
      return errorResponse(
        'مفتاح API عام لا يمكنه استقبال حجوزات القنوات — استخدم مفتاحاً خاصاً بفندق',
        403,
        'PLATFORM_KEY_NOT_ALLOWED'
      );
    }

    const provider = params.provider.toUpperCase();
    const PROVIDERS = ['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'AGODA', 'TRIP', 'OTHER'];
    if (!PROVIDERS.includes(provider)) {
      return errorResponse('مزود قناة غير معروف', 404);
    }

    const body = await request.json();

    if (body.provider && String(body.provider).toUpperCase() !== provider) {
      return errorResponse('تضارب في مزود القناة', 400);
    }
    if (body.hotelId && String(body.hotelId) !== apiKey.hotelId) {
      return errorResponse('الفندق المحدد لا يطابق نطاق المفتاح', 403, 'HOTEL_MISMATCH');
    }

    const result = await channelService.ingestInbound(apiKey.hotelId, provider, body);

    if (typeof result.status === 'number' && result.status >= 400) {
      return errorResponse(result.body.error, result.status);
    }
    return successResponse(result.body, result.status);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل استقبال طلب القناة', 400);
  }
}

export const POST = withApiKeyAuth(handler, ['bookings:write']);