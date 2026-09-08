import { NextRequest } from 'next/server';
import { WebsiteSettingsService } from '@/lib/services/website-settings.service';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withValidation } from '@/middlewares/validate';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { websiteSettingsSchema } from '@hotel/shared';

const service = new WebsiteSettingsService();

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const settings = await service.getSettings(user.hotelId);
    return successResponse(settings);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل جلب إعدادات الموقع');
  }
}

async function putHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const body = (request as any).validatedBody;
    const settings = await service.updateSettings(user.hotelId, body);
    return successResponse(settings);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث إعدادات الموقع');
  }
}

export const GET = withAuth(withRateLimit(getHandler), ['ADMIN']);
export const PUT = withAuth(withCsrf(withValidation(websiteSettingsSchema, withRateLimit(putHandler))), ['ADMIN']);
