import { NextRequest } from 'next/server';
import { prisma } from '@/lib/utils/prisma';
import { hashApiKey } from '@/lib/utils/api-key';
import { errorResponse } from '@/lib/utils/api-response';
import { rateLimit } from '@/middlewares/rate-limit';

export interface ApiKeyContext {
  keyId: string;
  label: string;
  hotelId?: string | null;
  partnerType: string;
  scopes: string[];
  rateLimit: number;
}

export interface ApiKeyRequest extends NextRequest {
  apiKey?: ApiKeyContext;
}

function extractClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function ipAllowed(allowedList: string | null | undefined, ip: string): boolean {
  if (!allowedList) return true;
  const remoteIp = ip === 'unknown' ? '' : ip;
  return allowedList
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .some(
      (entry) =>
        entry === remoteIp.toLowerCase() ||
        (remoteIp && entry.includes('/') && cidrMatches(entry, remoteIp))
    );
}

// Very small CIDR matcher for IPv4 (IPv6 support deferred to Redis-based limiter).
function cidrMatches(cidr: string, ip: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr || '32', 10);
  if (isNaN(bits)) return false;

  const rangeOctets = range.split('.').map(Number);
  const ipOctets = ip.split('.').map(Number);
  if (rangeOctets.length !== 4 || ipOctets.length !== 4) return false;

  const rangeInt = octetsToInt(rangeOctets);
  const ipInt = octetsToInt(ipOctets);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (rangeInt & mask) === (ipInt & mask);
}

function octetsToInt(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

// Authenticates an external consumer via X-API-Key header.
// Injects request.apiKey = { keyId, label, hotelId, partnerType, scopes, rateLimit }.
// Enforces: active, non-revoked, non-expired, IP allowlist, per-minute + per-day limits.
export function withApiKeyAuth(
  handler: Function,
  requiredScopes?: string[]
) {
  return async (request: ApiKeyRequest, context: any) => {
    const authHeader = request.headers.get('x-api-key');
    if (!authHeader) {
      return errorResponse('مفتاح API مطلوب في ترويسة X-API-Key', 401, 'MISSING_API_KEY');
    }

    const digest = hashApiKey(authHeader);
    let stored: {
      id: string;
      label: string;
      hotelId: string | null;
      partnerType: string;
      scopes: string[];
      rateLimit: number;
      dailyLimit: number;
      allowedIPs: string | null;
      isActive: boolean;
      revokedAt: Date | null;
      expiresAt: Date | null;
    } | null;

    try {
      stored = await prisma.apiKey.findUnique({ where: { keyHash: digest } });
    } catch (error) {
      return errorResponse('فشل التحقق من مفتاح API', 500, 'API_KEY_CHECK_FAILED');
    }

    if (!stored) {
      return errorResponse('مفتاح API غير صالح', 401, 'INVALID_API_KEY');
    }
    if (!stored.isActive || stored.revokedAt) {
      return errorResponse('مفتاح API معطّل', 401, 'API_KEY_REVOKED');
    }
    if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
      return errorResponse('انتهت صلاحية مفتاح API', 401, 'API_KEY_EXPIRED');
    }

    const clientIp = extractClientIp(request);
    if (!ipAllowed(stored.allowedIPs, clientIp)) {
      return errorResponse('العنوان IP غير مسموح لهذا المفتاح', 403, 'API_KEY_IP_BLOCKED');
    }

    const minuteBucket = rateLimit(`ak:min:${stored.id}`, stored.rateLimit, 60000);
    if (!minuteBucket.allowed) {
      return errorResponse('تجاوزت حد الطلبات في الدقيقة', 429, 'RATE_LIMITED');
    }

    const today = new Date().toISOString().split('T')[0];
    const dayBucket = rateLimit(`ak:day:${stored.id}:${today}`, stored.dailyLimit, 86400000);
    if (!dayBucket.allowed) {
      return errorResponse('تجاوزت الحد اليومي للطلبات', 429, 'DAILY_LIMIT_EXCEEDED');
    }

    if (requiredScopes?.length) {
      const keyScopes: string[] = stored.scopes || [];
      const missing = requiredScopes.find((scope) => !keyScopes.includes(scope));
      if (missing) {
        return errorResponse(`المفتاح لا يملك صلاحية ${missing}`, 403, 'INSUFFICIENT_SCOPE');
      }
    }

    // Non-blocking: don't slow down the response for bookkeeping.
    prisma.apiKey
      .update({ where: { id: stored.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    (request as any).apiKey = {
      keyId: stored.id,
      label: stored.label,
      hotelId: stored.hotelId,
      partnerType: stored.partnerType,
      scopes: stored.scopes,
      rateLimit: stored.rateLimit,
    };

    return handler(request, context);
  };
}

export function getApiKey(request: ApiKeyRequest): ApiKeyContext {
  if (!(request as any).apiKey) {
    throw new Error('Unauthorized: API key context missing');
  }
  return (request as any).apiKey;
}