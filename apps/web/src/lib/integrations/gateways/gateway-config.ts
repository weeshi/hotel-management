import { prisma } from '@/lib/utils/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { getProviderDefinition } from '@/lib/integrations/registry';
import { getPlutuConfig, PlutuConfig } from './plutu-client';
import { getTLyncConfig, TLyncConfig } from './tlync-client';

export type GatewayProviderName = 'plutu' | 'tlync';
export type GatewayResolvedConfig = PlutuConfig | TLyncConfig;

export type GatewayConfigSource = 'db' | 'env';

export type GatewayConfigFailureReason = 'NOT_CONFIGURED_DISABLED' | 'INVALID_STORED_SECRET';

export type GatewayConfigResolution =
  | { ok: true; config: GatewayResolvedConfig; source: GatewayConfigSource }
  | { ok: false; reason: GatewayConfigFailureReason };

export class GatewayConfigReadError extends Error {
  readonly reason: GatewayConfigFailureReason;

  constructor(message: string, reason: GatewayConfigFailureReason) {
    super(message);
    this.name = 'GatewayConfigReadError';
    this.reason = reason;
  }
}

export interface ResolveGatewayConfigOptions {
  hotelId?: string;
  override?: Partial<PlutuConfig> & Partial<TLyncConfig>;
}

const SECRET_CONFIG_KEYS = ['baseUrl', 'returnUrl', 'callbackUrl'] as const;

function envBaseConfig(gateway: GatewayProviderName): GatewayResolvedConfig {
  return gateway === 'plutu' ? getPlutuConfig() : getTLyncConfig();
}

function isGatewayProviderName(gateway: string): gateway is GatewayProviderName {
  return gateway === 'plutu' || gateway === 'tlync';
}

function parseStoredJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function overlayConfigFields(
  target: Record<string, unknown>,
  storedConfig: Record<string, unknown> | null
): void {
  if (!storedConfig) return;
  for (const key of SECRET_CONFIG_KEYS) {
    const value = storedConfig[key];
    if (typeof value === 'string' && value.trim()) {
      target[key] = value.trim();
    }
  }
}

/**
 * Resolves the effective gateway config for a hotel.
 *
 * Resolution order (single DB read, no caching — a unique-index findUnique is
 * sub-millisecond and secrets must reflect the last superadmin write instantly):
 *
 *  1. A scoped `IntegrationConfig` row (hotelId + engine, kind=PAYMENT_GATEWAY)
 *     is authoritative: its decrypted { merchantId, secretKey } bundle plus the
 *     non-secret config overlay replace the env defaults.
 *  2. If a row EXISTS but is disabled, or lacks a decryptable secret bundle,
 *     resolution FAILS — we must never fall back to the platform `.env` keys
 *     here (that would silently re-enable a disabled gateway and leak
 *     platform-level credentials across tenants).
 *  3. If NO row exists, the env-derived config (dev / legacy) is returned.
 *
 * An explicit `override` (test hook) always wins on top of either source.
 */
export async function resolveGatewayConfig(
  gateway: string,
  opts: ResolveGatewayConfigOptions = {}
): Promise<GatewayConfigResolution> {
  if (!isGatewayProviderName(gateway)) {
    throw new GatewayConfigReadError(`بوابة غير مدعومة: ${gateway}`, 'INVALID_STORED_SECRET');
  }

  const base = envBaseConfig(gateway);
  const def = getProviderDefinition(gateway);
  const secretFields = def?.secretFields ?? ['merchantId', 'secretKey'];

  if (opts.hotelId) {
    const row = await prisma.integrationConfig.findUnique({
      where: { hotelId_engine: { hotelId: opts.hotelId, engine: gateway } },
    });

    if (row) {
      if (!row.isActive || row.kind !== 'PAYMENT_GATEWAY') {
        return { ok: false, reason: 'NOT_CONFIGURED_DISABLED' };
      }

      let bundle: Record<string, string> | null = null;
      if (row.apiKeyEnc) {
        try {
          const parsed = parseStoredJson(decryptSecret(row.apiKeyEnc));
          if (parsed) {
            bundle = Object.fromEntries(
              Object.entries(parsed).filter(([, v]) => typeof v === 'string')
            ) as Record<string, string>;
          }
        } catch {
          bundle = null;
        }
      }

      const missing = secretFields.filter((field) => !bundle?.[field]?.trim());
      if (missing.length > 0) {
        return { ok: false, reason: 'INVALID_STORED_SECRET' };
      }

      const merged: Record<string, unknown> = { ...base };
      for (const field of secretFields) {
        merged[field] = bundle![field];
      }
      overlayConfigFields(merged, parseStoredJson(row.config));
      if (opts.override) {
        Object.assign(merged, opts.override);
      }
      return { ok: true, config: merged as unknown as GatewayResolvedConfig, source: 'db' };
    }
  }

  const merged: Record<string, unknown> = { ...base };
  if (opts.override) {
    Object.assign(merged, opts.override);
  }
  return { ok: true, config: merged as unknown as GatewayResolvedConfig, source: 'env' };
}

export function gatewayConfigReadErrorToMessage(reason: GatewayConfigFailureReason): string {
  return reason === 'NOT_CONFIGURED_DISABLED'
    ? 'بوابة الدفع غير مفعّلة لهذا الفندق'
    : 'إعدادات بوابة الدفع للفندق غير مكتملة';
}