import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/utils/prisma';
import { encryptSecret } from '@/lib/utils/crypto';
import { withPlatformAuth } from '@/middlewares/platform-auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';
import {
  getProviderDefinition,
  isSupportedProvider,
  validateSecretShape,
  pickConfigFields,
} from '@/lib/integrations/registry';

// Platform-wide integration-key management (docs/SUPER-ADMIN-ARCH.md §7, SA.4).
// Cross-tenant replacement of the hotel-admin `/api/admin/integrations` access.
// Every write/delete is recorded in `PlatformAuditLog`. Secrets NEVER leave the
// DB: GET exposes only `hasKey` (zero-leakage rule §7.3).

const ENTITY = 'INTEGRATION_CONFIG';
const KINDS = ['BOOKING_ENGINE', 'PAYMENT_GATEWAY'];

const postSchema = z.object({
  hotelId: z.string().min(1, 'معرّف الفندق مطلوب'),
  engine: z.string().min(1, 'اسم المزوّد مطلوب'),
  secret: z.unknown().optional(),
  config: z.unknown().optional(),
  isActive: z.boolean().optional(),
});

function serializeConfig(config: any) {
  let safeConfig: Record<string, any> | null = null;
  if (config.config) {
    try {
      safeConfig = JSON.parse(config.config);
    } catch {
      safeConfig = null;
    }
  }
  return {
    id: config.id,
    engine: config.engine,
    kind: config.kind,
    isActive: config.isActive,
    hasKey: Boolean(config.apiKeyEnc),
    config: safeConfig,
    updatedAt: config.updatedAt,
  };
}

function requestMeta(request: NextRequest) {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

async function requireHotel(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) {
    return { error: errorResponse('معرّف الفندق (hotelId) مطلوب', 400, 'HOTEL_REQUIRED') };
  }
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true } });
  if (!hotel) {
    return { error: errorResponse('الفندق غير موجود', 404, 'HOTEL_NOT_FOUND') };
  }
  return { hotel };
}

async function handleGet(request: NextRequest) {
  const { hotel, error } = await requireHotel(request);
  if (error) return error;
  const hotelId = (hotel as { id: string }).id;

  const kind = request.nextUrl.searchParams.get('kind');
  if (kind && !KINDS.includes(kind)) {
    return errorResponse('تصنيف غير معروف', 400, 'INVALID_KIND');
  }

  const configs = await prisma.integrationConfig.findMany({
    where: { hotelId, ...(kind ? { kind: kind as any } : {}) },
    orderBy: [{ kind: 'asc' }, { engine: 'asc' }],
  });

  return successResponse(configs.map(serializeConfig));
}

async function handlePost(request: NextRequest) {
  const meta = requestMeta(request);
  const body = postSchema.parse(await request.json());
  const user = (request as any).user;

  const hotel = await prisma.hotel.findUnique({
    where: { id: body.hotelId },
    select: { id: true, name: true },
  });
  if (!hotel) {
    return errorResponse('الفندق غير موجود', 404, 'HOTEL_NOT_FOUND');
  }

  if (!isSupportedProvider(body.engine)) {
    return errorResponse('مزوّد غير معروف', 400, 'UNKNOWN_PROVIDER');
  }
  const def = getProviderDefinition(body.engine)!;

  const existing = await prisma.integrationConfig.findUnique({
    where: { hotelId_engine: { hotelId: body.hotelId, engine: body.engine.toLowerCase() } },
  });

  const data: any = {};
  if (body.secret !== undefined) {
    const secret = validateSecretShape(def, body.secret);
    if (!secret.ok) {
      return errorResponse(secret.message, 400, 'INVALID_SECRET');
    }
    data.apiKeyEnc =
      def.rawSecret
        ? encryptSecret(secret.data as string)
        : encryptSecret(JSON.stringify(secret.data));
  }
  if (body.config !== undefined) {
    const config = pickConfigFields(def, body.config);
    data.config = config ?? undefined;
  }
  if (body.isActive !== undefined) {
    data.isActive = body.isActive;
  }
  if (data.config === undefined && body.config !== undefined) {
    data.config = null;
  }
  data.updatedById = user.userId;

  const config = await prisma.integrationConfig.upsert({
    where: { hotelId_engine: { hotelId: body.hotelId, engine: body.engine.toLowerCase() } },
    update: data,
    create: {
      hotelId: body.hotelId,
      engine: body.engine.toLowerCase(),
      kind: def.kind,
      ...data,
    },
  });

  const created = !existing;
  await recordPlatformAudit({
    actorUserId: user.userId,
    action: created ? 'INTEGRATION_CREATED' : 'INTEGRATION_UPDATED',
    entity: ENTITY,
    entityId: config.id,
    hotelId: hotel.id,
    oldValue: existing ? JSON.stringify({ isActive: existing.isActive }) : undefined,
    newValue: JSON.stringify({ isActive: config.isActive, engine: config.engine, kind: config.kind }),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return successResponse(serializeConfig(config), created ? 201 : 200);
}

async function handleDelete(request: NextRequest) {
  const meta = requestMeta(request);
  const user = (request as any).user;

  const hotelId = request.nextUrl.searchParams.get('hotelId');
  const engineRaw = request.nextUrl.searchParams.get('engine');
  if (!hotelId || !engineRaw) {
    return errorResponse('معرّف الفندق (hotelId) واسم المزوّد (engine) مطلوبان', 400, 'MISSING_PARAMS');
  }
  if (!isSupportedProvider(engineRaw)) {
    return errorResponse('مزوّد غير معروف', 400, 'UNKNOWN_PROVIDER');
  }

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, name: true },
  });
  if (!hotel) {
    return errorResponse('الفندق غير موجود', 404, 'HOTEL_NOT_FOUND');
  }

  const engine = engineRaw.toLowerCase();
  const existing = await prisma.integrationConfig.findUnique({
    where: { hotelId_engine: { hotelId, engine } },
  });
  if (!existing) {
    return errorResponse('التكامل غير موجود', 404, 'INTEGRATION_NOT_FOUND');
  }

  await prisma.integrationConfig.delete({ where: { id: existing.id } });

  await recordPlatformAudit({
    actorUserId: user.userId,
    action: 'INTEGRATION_DELETED',
    entity: ENTITY,
    entityId: existing.id,
    hotelId: hotel.id,
    oldValue: JSON.stringify({ engine: existing.engine, kind: existing.kind, isActive: existing.isActive }),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return successResponse({ deleted: true });
}

async function handler(request: NextRequest) {
  try {
    if (request.method === 'GET') return await handleGet(request);
    if (request.method === 'POST') return await handlePost(request);
    if (request.method === 'DELETE') return await handleDelete(request);
    return errorResponse('طريقة غير مدعومة', 405);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.errors.map((e) => e.message).join('، '), 422);
    }
    return errorResponse(error.message || 'فشل معالجة الطلب', error.statusCode || 400, error.code);
  }
}

export const GET = withPlatformAuth(withRateLimit(handler, 60));

export const POST = withPlatformAuth(withCsrf(withRateLimit(handler, 30)));

export const DELETE = withPlatformAuth(withCsrf(withRateLimit(handler, 30)));