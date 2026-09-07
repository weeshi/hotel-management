import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { encryptSecret } from '@/lib/utils/crypto';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { SUPPORTED_ENGINES } from '@/lib/integrations/normalizers';

function serializeConfig(config: any) {
  return {
    id: config.id,
    engine: config.engine,
    isActive: config.isActive,
    hasKey: Boolean(config.apiKeyEnc),
    updatedAt: config.updatedAt,
  };
}

async function handler(request: NextRequest, { params }: { params: { engine: string } }) {
  try {
    const user = (request as any).user;
    const engine = params.engine.toLowerCase();

    if (!(SUPPORTED_ENGINES as readonly string[]).includes(engine)) {
      return errorResponse('محرك غير معروف', 404);
    }

    const existing = await prisma.integrationConfig.findFirst({
      where: { hotelId: user.hotelId, engine },
    });
    if (!existing) {
      return errorResponse('إعدادات التكامل غير موجودة', 404);
    }

    if (request.method === 'GET') {
      return successResponse(serializeConfig(existing));
    }

    const body = await request.json();
    if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || !body.apiKey.trim())) {
      return errorResponse('مفتاح API غير صالح', 400);
    }

    const data: any = {
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    };
    if (body.apiKey) {
      data.apiKeyEnc = encryptSecret(String(body.apiKey).trim());
    }

    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }

    const config = await prisma.integrationConfig.update({
      where: { id: existing.id },
      data,
    });

    return successResponse(serializeConfig(config));
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث إعدادات التكامل', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);
export const PATCH = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);
