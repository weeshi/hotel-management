import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/utils/prisma';
import { encryptSecret } from '@/lib/utils/crypto';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { SUPPORTED_ENGINES } from '@/lib/integrations/normalizers';

// Generates/rotates a per-hotel API key for an engine. The plaintext key is
// returned exactly ONCE so the admin can hand it to the booking engine; it is
// stored encrypted and never retrievable again.
async function handler(request: NextRequest, { params }: { params: { engine: string } }) {
  try {
    const user = (request as any).user;
    const engine = params.engine.toLowerCase();

    if (!(SUPPORTED_ENGINES as readonly string[]).includes(engine)) {
      return errorResponse('محرك غير معروف', 404);
    }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const config = await prisma.integrationConfig.upsert({
      where: { hotelId_engine: { hotelId: user.hotelId, engine } },
      update: { apiKeyEnc: encryptSecret(apiKey) },
      create: { hotelId: user.hotelId, engine, apiKeyEnc: encryptSecret(apiKey) },
    });

    return successResponse({ engine, apiKey, hasKey: true, id: config.id });
  } catch (error: any) {
    return errorResponse(error.message || 'فشل توليد مفتاح API', 400);
  }
}

export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);
