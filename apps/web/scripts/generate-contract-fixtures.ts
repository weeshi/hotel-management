import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRACT_SECRETS,
  plutuSign,
  plutuVerifySignature,
  tlyncHmacSign,
  tlyncVerifySignature,
} from '../tests/contracts/shared/signer';

const SNAPSHOT_DATE = '2026-09-17';
const FIXTURES_ROOT = path.resolve(process.cwd(), 'tests', 'contracts', 'fixtures');
const CHECK_MODE = process.argv.includes('--check');

const PLUTU = {
  apiVersion: 'plutu@2025-sandbox',
  secretKey: CONTRACT_SECRETS.plutu.secretKey,
  merchantId: CONTRACT_SECRETS.plutu.merchantId,
  baseUrl: 'https://sandbox.plutu.ly/api/v1',
} as const;

const TLYNC = {
  apiVersion: 'tlync@2024-11',
  secretKey: CONTRACT_SECRETS.tlync.secretKey,
  merchantId: CONTRACT_SECRETS.tlync.merchantId,
  baseUrl: 'https://sandbox.tlync.ly/api/v1',
} as const;

function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function withSignature(
  provider: 'plutu' | 'tlync',
  unsigned: Record<string, unknown>,
  secretKey: string,
): Record<string, unknown> {
  const signature =
    provider === 'plutu' ? plutuSign(unsigned, secretKey) : tlyncHmacSign(unsigned, secretKey);
  return { ...unsigned, signature };
}

function plutuManifest(): Record<string, unknown> {
  return {
    provider: 'plutu',
    apiVersion: PLUTU.apiVersion,
    baseUrl: PLUTU.baseUrl,
    env: {
      merchantId: 'PLUTU_MERCHANT_ID',
      secretKey: 'PLUTU_SECRET_KEY',
      baseUrlOverride: 'PLUTU_BASE_URL',
    },
    create: {
      method: 'POST',
      path: '/api/v1/payment/create',
      signed: true,
      signatureAlgorithm:
        'sha256 over sorted `k=v` joined by `&` with `&secret=<key>` appended',
    },
    webhook: {
      delivery: 'POST <app>/api/external/gateways/plutu/webhook',
      signature: {
        algorithm: 'sha256',
        excluded: ['signature'],
        suffix: '&secret=<key>',
      },
      idFields: ['transaction_id'],
      fields: ['transaction_id', 'order_id', 'amount', 'currency', 'status', 'payment_method', 'paid_at'],
    },
    fixtures: ['webhook.success.json', 'webhook.failed.json', 'webhook.pending.json', 'create.request.json'],
  };
}

function tlyncManifest(): Record<string, unknown> {
  return {
    provider: 'tlync',
    apiVersion: TLYNC.apiVersion,
    baseUrl: TLYNC.baseUrl,
    env: {
      merchantId: 'TLYNC_MERCHANT_ID',
      secretKey: 'TLYNC_SECRET_KEY',
      baseUrlOverride: 'TLYNC_BASE_URL',
    },
    create: {
      method: 'POST',
      path: '/api/v1/payment/initiate',
      signed: false,
    },
    webhook: {
      delivery: 'POST <app>/api/external/gateways/tlync/webhook',
      signature: {
        algorithm: 'hmac-sha256',
        excluded: ['signature'],
        suffix: '',
      },
      idFields: ['tran_id'],
      fields: ['tran_id', 'order_id', 'amount', 'currency', 'status', 'payment_method', 'paid_at'],
    },
    fixtures: ['webhook.success.json', 'webhook.failed.json', 'webhook.pending.json', 'create.request.json'],
  };
}

function plutuWebhook(
  scenario: 'success' | 'failed' | 'pending',
  override: Record<string, unknown>,
): Record<string, unknown> {
  const unsigned = {
    transaction_id: `plu_txn_golden_2026_0000${scenario === 'success' ? 1 : scenario === 'failed' ? 2 : 3}`,
    order_id: `ord_golden_plutu_0000${scenario === 'success' ? 1 : scenario === 'failed' ? 2 : 3}`,
    amount: scenario === 'success' ? 500 : 400,
    currency: 'LYD',
    status: scenario.toUpperCase(),
    payment_method: 'card',
    paid_at: '2026-09-17T10:30:00Z',
    ...override,
  };
  return {
    meta: {
      provider: 'plutu',
      apiVersion: PLUTU.apiVersion,
      scenario: `webhook-${scenario}`,
      signedWith: PLUTU.secretKey,
      updatedAt: SNAPSHOT_DATE,
    },
    payload: withSignature('plutu', unsigned, PLUTU.secretKey),
  };
}

function plutuCreateRequest(): Record<string, unknown> {
  const unsigned = {
    merchant_id: PLUTU.merchantId,
    amount: '500',
    currency: 'LYD',
    order_id: 'ord_golden_plutu_00001',
    customer_name: 'AHMED AL-OBEIDI',
    customer_email: 'guest@example.ly',
    customer_phone: '+218910000000',
    description: 'Test booking payment',
    return_url: 'https://example.com/payment/return',
    callback_url: 'https://example.com/api/external/gateways/plutu/webhook',
  };
  return {
    meta: {
      provider: 'plutu',
      apiVersion: PLUTU.apiVersion,
      scenario: 'create-request',
      signedWith: PLUTU.secretKey,
      note: 'Canonical documented template. Runtime assertions validate the schema + recomputed signature of the actually-sent request.',
    },
    payload: withSignature('plutu', unsigned, PLUTU.secretKey),
  };
}

function tlyncWebhook(
  scenario: 'success' | 'failed' | 'pending',
  override: Record<string, unknown>,
): Record<string, unknown> {
  const unsigned = {
    tran_id: `tln_tran_golden_2026_0000${scenario === 'success' ? 1 : scenario === 'failed' ? 2 : 3}`,
    order_id: `ord_golden_tlync_0000${scenario === 'success' ? 1 : scenario === 'failed' ? 2 : 3}`,
    amount: scenario === 'success' ? 300 : 250,
    currency: 'LYD',
    status: scenario.toUpperCase(),
    payment_method: 'wallet',
    paid_at: '2026-09-17T11:00:00Z',
    ...override,
  };
  return {
    meta: {
      provider: 'tlync',
      apiVersion: TLYNC.apiVersion,
      scenario: `webhook-${scenario}`,
      signedWith: TLYNC.secretKey,
      updatedAt: SNAPSHOT_DATE,
    },
    payload: withSignature('tlync', unsigned, TLYNC.secretKey),
  };
}

function tlyncCreateRequest(): Record<string, unknown> {
  return {
    meta: {
      provider: 'tlync',
      apiVersion: TLYNC.apiVersion,
      scenario: 'create-request',
      note: 'Canonical documented template (create is NOT signed). Runtime assertions validate the schema of the actually-sent request.',
    },
    payload: {
      merchant_id: TLYNC.merchantId,
      amount: 300,
      currency: 'LYD',
      order_id: 'ord_golden_tlync_00001',
      customer_name: 'KHADIJA AL-GHARYANI',
      customer_email: 'guest2@example.ly',
      customer_phone: '+218920000000',
      description: 'Test booking payment',
      return_url: 'https://example.com/payment/return/tlync',
      callback_url: 'https://example.com/api/external/gateways/tlync/webhook',
    },
  };
}

function assertSignatures(): void {
  const plutuFixtures = [plutuWebhook('success', {}), plutuWebhook('failed', {}), plutuWebhook('pending', {})];
  for (const fixture of plutuFixtures) {
    if (!plutuVerifySignature(fixture.payload as Record<string, unknown>, PLUTU.secretKey)) {
      throw new Error(`Plutu fixture self-verification failed: ${String((fixture.meta as any).scenario)}`);
    }
  }
  const tlyncFixtures = [tlyncWebhook('success', {}), tlyncWebhook('failed', {}), tlyncWebhook('pending', {})];
  for (const fixture of tlyncFixtures) {
    if (!tlyncVerifySignature(fixture.payload as Record<string, unknown>, TLYNC.secretKey)) {
      throw new Error(`TLync fixture self-verification failed: ${String((fixture.meta as any).scenario)}`);
    }
  }
}

function buildFixtures(): Map<string, string> {
  assertSignatures();
  const files = new Map<string, string>();
  files.set('plutu/v1/manifest.json', render(plutuManifest()));
  files.set('plutu/v1/webhook.success.json', render(plutuWebhook('success', {})));
  files.set('plutu/v1/webhook.failed.json', render(plutuWebhook('failed', {})));
  files.set('plutu/v1/webhook.pending.json', render(plutuWebhook('pending', {})));
  files.set('plutu/v1/create.request.json', render(plutuCreateRequest()));
  files.set('tlync/v1/manifest.json', render(tlyncManifest()));
  files.set('tlync/v1/webhook.success.json', render(tlyncWebhook('success', {})));
  files.set('tlync/v1/webhook.failed.json', render(tlyncWebhook('failed', {})));
  files.set('tlync/v1/webhook.pending.json', render(tlyncWebhook('pending', {})));
  files.set('tlync/v1/create.request.json', render(tlyncCreateRequest()));
  return files;
}

function run(): void {
  if (!fs.existsSync(FIXTURES_ROOT)) {
    console.error(`Fixtures root not found: ${FIXTURES_ROOT}`);
    console.error('Run this script via `npm run generate:contract-fixtures` from apps/web.');
    process.exitCode = 1;
    return;
  }

  const files = buildFixtures();
  const drift: string[] = [];

  for (const [relativePath, content] of files) {
    const absolutePath = path.join(FIXTURES_ROOT, relativePath);
    const existing = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;

    if (CHECK_MODE) {
      if (existing !== content) {
        drift.push(relativePath);
        console.error(`DRIFT  ${relativePath}`);
      }
      continue;
    }

    if (existing === content) {
      console.log(`unchanged  ${relativePath}`);
      continue;
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
    console.log(`${existing === null ? 'created  ' : 'updated  '}${relativePath}`);
  }

  if (CHECK_MODE) {
    if (drift.length > 0) {
      console.error(
        `\n${drift.length} fixture(s) out of date. Run \`npm run generate:contract-fixtures\` and commit the result.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`All ${files.size} contract fixtures are up to date.`);
    return;
  }

  console.log(`\nWrote ${files.size} contract fixtures to ${FIXTURES_ROOT}`);
}

run();