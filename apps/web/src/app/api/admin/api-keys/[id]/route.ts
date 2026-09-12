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

async function handler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (request as any).user;

    const existing = await prisma.apiKey.findUnique({ where: { id: params.id } });
    if (!existing) {
      return errorResponse('مفتاح API غير موجود', 404);
    }

    // ADMIN/MANAGER manage only their own hotel's keys.
    if (user.role !== 'SUPER_ADMIN' && existing.hotelId !== user.hotelId) {
      return errorResponse('لا يمكنك الوصول لمفتاح هذا الفندق', 403);
    }

    if (request.method === 'GET') {
      return successResponse(serializeApiKey(existing));
    }

    if (request.method === 'DELETE') {
      const revoked = await prisma.apiKey.update({
        where: { id: existing.id },
        data: { isActive: false, revokedAt: new Date() },
      });
      return successResponse(serializeApiKey(revoked));
    }

    const body = await request.json();

    if (request.method === 'POST') {
      // Action-based mutation (rotate), body: { action: 'rotate' }
      if (String(body.action || '').toLowerCase() !== 'rotate') {
        return errorResponse('إجراء غير معروف', 400);
      }
      if (!existing.isActive) {
        return errorResponse('لا يمكن تدوير مفتاح معطّل', 400);
      }

      const apiKey = generateApiKey();
      const rotated = await prisma.apiKey.update({
        where: { id: existing.id },
        data: {
          keyHash: hashApiKey(apiKey),
          prefix: apiKeyPrefix(apiKey),
          lastRotatedAt: new Date(),
        },
      });
      return successResponse({ key: serializeApiKey(rotated), apiKey });
    }

    // PATCH: partial update with strict whitelist.
    const data: any = {};

    if (body.label !== undefined) {
      const label = String(body.label).trim();
      if (!label) return errorResponse('اسم المفتاح مطلوب', 400);
      data.label = label;
    }

    if (body.partnerType !== undefined) {
      const partnerType = String(body.partnerType);
      if (!(PARTNER_TYPES as readonly string[]).includes(partnerType)) {
        return errorResponse('نوع الشريك غير صالح', 400);
      }
      data.partnerType = partnerType;
    }

    if (body.scopes !== undefined) {
      const scopes: string[] = Array.isArray(body.scopes)
        ? body.scopes.filter((s: any) => typeof s === 'string')
        : [];
      const invalidScope = scopes.find((s) => !(KNOWN_SCOPES as readonly string[]).includes(s));
      if (invalidScope) return errorResponse(`صلاحية غير معروفة: ${invalidScope}`, 400);
      data.scopes = scopes;
    }

    if (body.rateLimit !== undefined) {
      const n = Number(body.rateLimit);
      if (Number.isNaN(n) || n < 1 || n > 100000) {
        return errorResponse('rateLimit يجب أن يكون بين 1 و 100000', 400);
      }
      data.rateLimit = Math.floor(n);
    }

    if (body.dailyLimit !== undefined) {
      const n = Number(body.dailyLimit);
      if (Number.isNaN(n) || n < 1 || n > 1000000) {
        return errorResponse('dailyLimit يجب أن يكون بين 1 و 1000000', 400);
      }
      data.dailyLimit = Math.floor(n);
    }

    if (body.allowedIPs !== undefined) {
      data.allowedIPs = body.allowedIPs
        ? String(body.allowedIPs).trim().replace(/\s+/g, '').replace(/,\s*/g, ',')
        : null;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    if (body.revokedAt !== undefined) {
      if (body.revokedAt === null) {
        data.revokedAt = null;
        data.isActive = true;
      }
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        data.expiresAt = null;
      } else {
        const d = new Date(String(body.expiresAt));
        if (Number.isNaN(d.getTime())) return errorResponse('تاريخ الانتهاء غير صالح', 400);
        data.expiresAt = d;
      }
    }

    const updated = await prisma.apiKey.update({
      where: { id: existing.id },
      data,
    });

    return successResponse(serializeApiKey(updated));
  } catch (error: any) {
    return errorResponse(error.message || 'فشل تحديث مفتاح API', 400);
  }
}

export const GET = withAuth(handler, ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
export const PATCH = withAuth(withCsrf(withRateLimit(handler)), ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
export const POST = withAuth(withCsrf(withRateLimit(handler)), ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
export const DELETE = withAuth(withCsrf(withRateLimit(handler)), ['SUPER_ADMIN', 'ADMIN', 'MANAGER']);