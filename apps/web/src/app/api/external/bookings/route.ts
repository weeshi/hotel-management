import { NextRequest } from 'next/server';
import { withApiKeyAuth, getApiKey } from '@/middlewares/api-key-auth';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { ExternalBookingService } from '@/lib/services/external-booking.service';

// Headless Booking API — external consumers create bookings on behalf of a hotel.
// Auth: X-API-Key issued via /api/admin/api-keys (hashed, scoped, rate limited).

const externalBookingService = new ExternalBookingService();

async function handler(request: NextRequest) {
  try {
    const apiKey = getApiKey(request);

    if (!apiKey.hotelId) {
      return errorResponse(
        'مفتاح API عام (منصة) لا يمكنه إنشاء حجوزات — استخدم مفتاحاً خاصاً بفندق',
        403,
        'PLATFORM_KEY_NOT_ALLOWED'
      );
    }

    const body = await request.json();

    if (body.hotelId && String(body.hotelId) !== apiKey.hotelId) {
      return errorResponse('الفندق المحدد لا يطابق نطاق المفتاح المستخدم', 403, 'HOTEL_MISMATCH');
    }

    const result = await externalBookingService.create(apiKey.hotelId, apiKey.partnerType, body);

    if (typeof result.status === 'number' && result.status >= 400) {
      return errorResponse(result.body.error, result.status);
    }
    return successResponse(result.body, result.status);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء الحجز', 400);
  }
}

export const POST = withApiKeyAuth(withRateLimit(handler), ['bookings:write']);