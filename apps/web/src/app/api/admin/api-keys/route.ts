import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import {
  KNOWN_SCOPES,
  PARTNER_TYPES,
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
  serializeApiKey,
} from '@/lib/utils/api-key';

// Headless Booking API key management (Sprint 1: external API ecosystem).
// Plaintext keys are returned EXACTLY ONCE at creation/rotation time; only
// the SHA-256 digest is stored.

function parseOptionalInt(value: any, min: number, max: number): number {
  const n = Number(value);
  if (Number.isNaN(n) || n < min || n > max) {
    throw new Error(`القيمة يجب أن تكون بين ${min} و ${max}`);
  }
  return Math.floor(n);
}

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;

    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url);
      const requestedHotelId = searchParams.get('hotelId');

      // ADMIN/MANAGER only see their own hotel. SUPER_ADMIN may list any (or all).
      let hotelFilter: string | null = user.hotelId || null;
      if (user.role === 'SUPER_ADMIN' && requestedHotelId) {
        hotelFilter = requestedHotelId;
      }
      if (user.role === 'SUPER_ADMIN' && !requestedHotelId) hotelFilter = null;

      const keys = await prisma.apiKey.findMany({
        where: hotelFilter ? { hotelId: hotelFilter } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      return successResponse(keys.map(serializeApiKey));
    }

    const body = await request.json();

    const label = String(body.label || '').trim();
    if (!label) {
      return errorResponse('اسم المفتاح مطلوب', 400);
    }

    const partnerType = String(body.partnerType || 'B2B_AGENCY');
    if (!(PARTNER_TYPES as readonly string[]).includes(partnerType)) {
      return errorResponse('نوع الشريك غير صالح', 400);
    }

    const scopes: string[] = Array.isArray(body.scopes)
      ? body.scopes.filter((s: any) => typeof s === 'string')
      : ['bookings:write'];
    const invalidScope = scopes.find((s) => !(KNOWN_SCOPES as readonly string[]).includes(s));
    if (invalidScope) {
      return errorResponse(`صلاحية غير معروفة: ${invalidScope}`, 400);
    }

    // Hotel scope. Platform-wide keys (hotelId null) are SUPER_ADMIN only.
    let hotelId: string | null = null;
    if (body.hotelId) {
      hotelId = String(body.hotelId);
      const isOwnHotel = user.hotelId && user.hotelId === hotelId;
      if (user.role !== 'SUPER_ADMIN' && !isOwnHotel) {
        return errorResponse('لا يمكنك إنشاء مفتاح لفندق آخر', 403);
      }
    } else if (user.role === 'SUPER_ADMIN' && !body.hotelId) {
      // platform-wide key — allowed only for SUPER_ADMIN
    } else {
      hotelId = user.hotelId || null;
    }

    let rateLimit = 100;
    let dailyLimit = 10000;
    try {
      rateLimit = parseOptionalInt(body.rateLimit ?? 100, 1, 100000);
      dailyLimit = parseOptionalInt(body.dailyLimit ?? 10000, 1, 1000000);
    } catch (e: any) {
      return errorResponse(e.message, 400);
    }

    const allowedIPs = body.allowedIPs
      ? String(body.allowedIPs).trim().replace(/\s+/g, '').replace(/,\s*/g, ',')
      : null;

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      expiresAt = new Date(String(body.expiresAt));
      if (Number.isNaN(expiresAt.getTime())) {
        return errorResponse('تاريخ الانتهاء غير صالح', 400);
      }
    }

    const apiKey = generateApiKey();
    const created = await prisma.apiKey.create({
      data: {
        label,
        hotelId,
        partnerType: partnerType as any,
        prefix: apiKeyPrefix(apiKey),
        keyHash: hashApiKey(apiKey),
        scopes,
        rateLimit,
        dailyLimit,
        allowedIPs,
        expiresAt,
        createdById: user.userId,
      },
    });

    return successResponse({ key: serializeApiKey(created), apiKey }, 201);
  } catch (error: any) {
    return errorResponse(error.message || 'فشل إنشاء مفتاح API', 400);
  }
}

export const GET = withAuth(handler, ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withRateLimit(handler)), ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);