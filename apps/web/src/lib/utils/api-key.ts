import crypto from 'crypto';

export const API_KEY_PREFIX = 'hk_';

// Generates a random future-proof API key: hk_<8-prefix>_<32-byte-secret>.
// The full value is shown to the owner exactly ONCE (create/rotate).
export function generateApiKey(): string {
  const prefix = crypto.randomBytes(4).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  return `${API_KEY_PREFIX}${prefix}_${secret}`;
}

// Never store the raw key. Lookups happen on the SHA-256 digest only.
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Masked form for UI/listings: hk_a1b2c3…9f0e
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 16) return apiKey.slice(0, 4) + '…';
  return `${apiKey.slice(0, 11)}…${apiKey.slice(-4)}`;
}

// Strips the event's undisclosed portion for audit logs.
export function keyLabel(apiKey: string): string {
  return maskApiKey(apiKey);
}

// --- Management contract (shared by admin routes + UI) ---
export const KNOWN_SCOPES = [
  'bookings:write',
  'bookings:read',
  'availability:read',
  'pricing:read',
  'webhook:manage',
] as const;

export const PARTNER_TYPES = [
  'HOTEL_SITE',
  'B2C_AGGREGATOR',
  'B2B_AGENCY',
  'CHANNEL_MANAGER',
] as const;

// Visible identifier (hk_<8 hex>). Safe for listings/UI — reveals no secret.
export function apiKeyPrefix(apiKey: string): string {
  const parts = apiKey.split('_');
  return parts.length >= 2 ? parts.slice(0, 2).join('_') : (parts[0] || '');
}

// Serializes an ApiKey row WITHOUT any hash/secret material.
export function serializeApiKey(
  key: {
    id: string;
    label: string;
    hotelId: string | null;
    partnerType: string;
    prefix: string;
    scopes: string[];
    rateLimit: number;
    dailyLimit: number;
    allowedIPs: string | null;
    isActive: boolean;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    lastRotatedAt: Date | null;
  }
) {
  return {
    id: key.id,
    label: key.label,
    hotelId: key.hotelId,
    partnerType: key.partnerType,
    prefix: key.prefix,
    scopes: key.scopes,
    rateLimit: key.rateLimit,
    dailyLimit: key.dailyLimit,
    allowedIPs: key.allowedIPs,
    isActive: key.isActive,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    lastRotatedAt: key.lastRotatedAt,
  };
}