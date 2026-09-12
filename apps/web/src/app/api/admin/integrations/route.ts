import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { encryptSecret } from '@/lib/utils/crypto';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { SUPPORTED_ENGINES } from '@/lib/integrations/normalizers';

// Per-tenant external booking-engine integrations (AGENTS.md §16/§14). API keys
// are stored encrypted and NEVER returned — only a `hasKey` flag is exposed.
function serializeConfig(config: any) {
  return {
    id: config.id,
    engine: config.engine,
    isActive: config.isActive,
    hasKey: Boolean(config.apiKeyEnc),
    updatedAt: config.updatedAt,
  };
}

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;

    if (request.method === 'GET') {
      const configs = await prisma.integrationConfig.findMany({
        where: { hotelId: user.hotelId },
        orderBy: { engine: 'asc' },
      });

      return successResponse(configs.map(serializeConfig));
    }

    const body = await request.json();
    const engine = String(body.engine || '').toLowerCase();

    if (!(SUPPORTED_ENGINES as readonly string[]).includes(engine)) {
      return errorResponse('محرك غير معروف', 400);
    }
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

    const config = await prisma.integrationConfig.upsert({
      where: { hotelId_engine: { hotelId: user.hotelId, engine } },
      update: data,
      create: { hotelId: user.hotelId, engine, ...data },
    });

    return successResponse(serializeConfig(config), 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل حفظ إعدادات التكامل', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);
