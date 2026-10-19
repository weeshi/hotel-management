import type { IntegrationKind } from '@prisma/client';

// --- Provider Registry (SA.4 / AGENTS.md §14 §16) ---
// Single source of truth mapping every supported `engine` to its kind,
// its encrypted-secret shape, and its allowed non-secret config keys.
//
// Two storage shapes coexist in `IntegrationConfig.apiKeyEnc`:
//   - rawSecret (BOOKING_ENGINE): `encryptSecret(apiKey)` — identical to the
//     legacy hotel-admin storage so `withExternalAuth` keeps working unchanged.
//   - JSON bundle (PAYMENT_GATEWAY): `encryptSecret(JSON.stringify(bundle))`
//     where the bundle contains ONLY the declared `secretFields`.
//
// Extensibility lives HERE, not in the encrypted blob: adding a future
// credential (e.g. `webhookSecret`) is a one-line `secretFields` addition —
// no schema, no migration, backward compatible.

export type ProviderSecret = string | Record<string, string>;

export interface ProviderDefinition {
  kind: IntegrationKind;
  /** Shape of the credential accepted at write time and sealed into apiKeyEnc. */
  secretFields: string[];
  /** Non-secret config keys that may be stored in `IntegrationConfig.config`. */
  configFields: string[];
  /** true => apiKeyEnc is a raw string credential; false => JSON bundle. */
  rawSecret: boolean;
}

export const PAYMENT_GATEWAY_ENGINES = ['plutu', 'tlync'] as const;
export type PaymentGatewayEngine = (typeof PAYMENT_GATEWAY_ENGINES)[number];

export const PROVIDER_REGISTRY: Record<string, ProviderDefinition> = {
  'booking.com': { kind: 'BOOKING_ENGINE', secretFields: ['apiKey'], configFields: [], rawSecret: true },
  expedia:       { kind: 'BOOKING_ENGINE', secretFields: ['apiKey'], configFields: [], rawSecret: true },
  website:       { kind: 'BOOKING_ENGINE', secretFields: ['apiKey'], configFields: [], rawSecret: true },
  custom:        { kind: 'BOOKING_ENGINE', secretFields: ['apiKey'], configFields: [], rawSecret: true },
  plutu:         { kind: 'PAYMENT_GATEWAY', secretFields: ['merchantId', 'secretKey'], configFields: ['baseUrl', 'returnUrl', 'callbackUrl', 'isSandbox'], rawSecret: false },
  tlync:         { kind: 'PAYMENT_GATEWAY', secretFields: ['merchantId', 'secretKey'], configFields: ['baseUrl', 'returnUrl', 'callbackUrl', 'isSandbox'], rawSecret: false },
};

export const ALL_PROVIDERS = Object.keys(PROVIDER_REGISTRY);

export function getProviderDefinition(engine: string): ProviderDefinition | null {
  return PROVIDER_REGISTRY[engine.toLowerCase()] ?? null;
}

export function isSupportedProvider(engine: string): boolean {
  return getProviderDefinition(engine) !== null;
}

export function isPaymentGateway(engine: string): boolean {
  return getProviderDefinition(engine)?.kind === 'PAYMENT_GATEWAY';
}

/** Validates + picks a credential payload against the provider's secret shape. */
export function validateSecretShape(
  def: ProviderDefinition,
  secret: unknown
): { ok: true; data: ProviderSecret } | { ok: false; message: string } {
  if (def.rawSecret) {
    const apiKey = (secret as any)?.apiKey;
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return { ok: false, message: 'مفتاح API مطلوب' };
    }
    return { ok: true, data: apiKey.trim() };
  }

  if (typeof secret !== 'object' || secret === null || Array.isArray(secret)) {
    return { ok: false, message: 'بيانات الاعتماد مطلوبة ككائن' };
  }

  const bundle: Record<string, string> = {};
  for (const field of def.secretFields) {
    const value = (secret as any)[field];
    if (typeof value !== 'string' || !value.trim()) {
      return { ok: false, message: `الحقل السرّي \`${field}\` مطلوب` };
    }
    bundle[field] = value.trim();
  }
  return { ok: true, data: bundle };
}

/** Picks only the allowed non-secret config keys. */
export function pickConfigFields(def: ProviderDefinition, config: unknown): string | undefined {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return undefined;
  const allowed: Record<string, any> = {};
  for (const field of def.configFields) {
    if ((config as any)[field] !== undefined && (config as any)[field] !== null) {
      allowed[field] = (config as any)[field];
    }
  }
  if (Object.keys(allowed).length === 0) return undefined;
  return JSON.stringify(allowed);
}