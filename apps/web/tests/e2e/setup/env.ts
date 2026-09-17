import { CONTRACT_SECRETS } from '../../contracts/shared/signer';

/**
 * Single source of truth for E2E infrastructure configuration. Both
 * `playwright.config.ts` and the Playwright `global.setup.ts` import this module
 * so ports, the database URL and the (test-only) gateway secrets can never drift
 * apart. Gateway signing secrets are reused from the contract-test signer.
 */
export const E2E = {
  appPort: Number(process.env.E2E_APP_PORT ?? 3100),
  dummyPort: Number(process.env.E2E_DUMMY_PORT ?? 4400),
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hotel_e2e',
  paymentCryptoKey: process.env.E2E_PAYMENT_CRYPTO_KEY ?? 'a'.repeat(64),
  secrets: CONTRACT_SECRETS,
} as const;

export const APP_BASE = `http://127.0.0.1:${E2E.appPort}`;
export const DUMMY_BASE = `http://127.0.0.1:${E2E.dummyPort}`;

const APP_ENV_EXTRA: Record<string, string> = {
  DATABASE_URL: E2E.databaseUrl,
  PAYMENT_CRYPTO_KEY: E2E.paymentCryptoKey,
  PLUTU_BASE_URL: DUMMY_BASE,
  TLYNC_BASE_URL: DUMMY_BASE,
  PLUTU_MERCHANT_ID: E2E.secrets.plutu.merchantId,
  PLUTU_SECRET_KEY: E2E.secrets.plutu.secretKey,
  TLYNC_MERCHANT_ID: E2E.secrets.tlync.merchantId,
  TLYNC_SECRET_KEY: E2E.secrets.tlync.secretKey,
  PLUTU_CALLBACK_URL: `${APP_BASE}/api/external/gateways/plutu/webhook`,
  TLYNC_CALLBACK_URL: `${APP_BASE}/api/external/gateways/tlync/webhook`,
  PLUTU_WEBHOOK_IPS: '127.0.0.1',
  TLYNC_WEBHOOK_IPS: '127.0.0.1',
  PORT: String(E2E.appPort),
};

const DUMMY_ENV_EXTRA: Record<string, string> = {
  E2E_DUMMY_PORT: String(E2E.dummyPort),
};

function mergeEnv(extra: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  return { ...merged, ...extra };
}

export const APP_ENV = mergeEnv(APP_ENV_EXTRA);
export const DUMMY_ENV = mergeEnv(DUMMY_ENV_EXTRA);
