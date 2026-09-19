import http from 'node:http';
import { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONTRACT_SECRETS,
  ContractGateway,
  buildSignedWebhook,
  providerWebhookIdField,
  plutuVerifySignature,
} from '../shared/signer';

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FailBehavior {
  status?: number;
  body?: Record<string, unknown>;
}

export interface GatewayBehavior {
  failCreate?: {
    plutu?: FailBehavior;
    tlync?: FailBehavior;
  };
}

export interface DummyGatewaySecrets {
  secretKey: string;
  merchantId: string;
}

export interface DummyGatewayOptions {
  /**
   * Fixed port for the standalone (E2E) mode. Omit to bind an ephemeral port
   * (in-process contract-test mode).
   */
  port?: number;
  /**
   * Signing secrets per provider. Defaults to the shared CONTRACT_SECRETS so the
   * in-process contract tests need no configuration.
   */
  secrets?: Record<ContractGateway, DummyGatewaySecrets>;
}

export interface DummyGatewayServer {
  baseUrl: string;
  port: number;
  readonly requests: CapturedRequest[];
  behavior: GatewayBehavior;
  start(): Promise<void>;
  close(): Promise<void>;
  clearRequests(): void;
  scheduleDelivery(delayMs: number, deliver: () => Promise<void>): void;
  clearDeliveries(): void;
}

export type WebhookStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' | 'EXPIRED';

interface CreateRecord {
  provider: ContractGateway;
  sessionId: string;
  transactionId: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  callbackUrl: string;
  returnUrl: string;
}

const CREATE_PATH: Record<ContractGateway, string> = {
  plutu: '/payment/create',
  tlync: '/payment/initiate',
};

const DEFAULT_PAYMENT_METHOD: Record<ContractGateway, string> = {
  plutu: 'card',
  tlync: 'wallet',
};

function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPayPage(record: CreateRecord, origin: string): string {
  const action = `${origin}/pay/${record.sessionId}/complete`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dummy Gateway — Checkout</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; justify-content:center; padding:48px 16px; }
    .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:32px; width:360px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:#94a3b8; font-size:12px; margin-bottom:24px; }
    dl { display:grid; grid-template-columns:auto 1fr; gap:8px 16px; font-size:14px; margin:0 0 24px; }
    dt { color:#94a3b8; }
    dd { margin:0; text-align:right; }
    button { width:100%; padding:12px; border-radius:8px; border:0; font-size:15px; font-weight:600; cursor:pointer; }
    .succeed { background:#16a34a; color:#fff; margin-bottom:12px; }
    .fail { background:#dc2626; color:#fff; }
    .skip { background:transparent; border:1px solid #475569; color:#cbd5e1; margin-top:12px; }
  </style>
</head>
<body>
  <div class="card" data-testid="dummy-gateway-checkout">
    <h1>Dummy Gateway</h1>
    <div class="sub">${escapeHtml(record.provider.toUpperCase())} sandbox checkout — no real charge</div>
    <dl>
      <dt>Order</dt><dd data-testid="dg-order-id">${escapeHtml(record.orderId)}</dd>
      <dt>Amount</dt><dd data-testid="dg-amount">${escapeHtml(record.amount)} ${escapeHtml(record.currency)}</dd>
      <dt>Session</dt><dd>${escapeHtml(record.sessionId)}</dd>
    </dl>
    <form method="POST" action="${action}">
      <button class="succeed" type="submit" name="outcome" value="success" data-testid="dg-succeed">Pay successfully</button>
      <button class="fail" type="submit" name="outcome" value="failed" data-testid="dg-fail">Fail payment</button>
    </form>
    <form method="POST" action="${action}">
      <button class="skip" type="submit" name="outcome" value="cancel" data-testid="dg-cancel">Return without paying</button>
    </form>
  </div>
</body>
</html>`;
}

export async function createDummyGateway(
  opts: DummyGatewayOptions = {},
): Promise<DummyGatewayServer> {
  const requests: CapturedRequest[] = [];
  const behavior: GatewayBehavior = {};
  const timers: NodeJS.Timeout[] = [];
  const creates = new Map<string, CreateRecord>();
  const secrets: Record<ContractGateway, DummyGatewaySecrets> = opts.secrets ?? CONTRACT_SECRETS;
  let closed = false;

  const nowIso = () => new Date().toISOString();

  function loadFixture(provider: ContractGateway, name: string): Record<string, unknown> | null {
    try {
      const filePath = path.resolve(__dirname, '..', 'fixtures', provider, 'v1', `${name}.json`);
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
        payload?: Record<string, unknown>;
      };
      return parsed.payload ?? null;
    } catch {
      return null;
    }
  }

  function buildWebhookPayload(
    record: CreateRecord,
    status: WebhookStatus,
    fixtureName?: string,
  ): Record<string, unknown> {
    const idField = providerWebhookIdField(record.provider);
    const fixture = fixtureName ? loadFixture(record.provider, fixtureName) : null;
    const base: Record<string, unknown> = fixture
      ? { ...fixture }
      : {
          [idField]: record.transactionId,
          order_id: record.orderId,
          amount: record.amount,
          currency: record.currency,
          payment_method: record.paymentMethod,
          paid_at: nowIso(),
        };
    base[idField] = record.transactionId;
    base.order_id = record.orderId;
    base.amount = record.amount;
    base.currency = record.currency;
    base.status = status;
    if (!fixture) base.paid_at = nowIso();
    return buildSignedWebhook(record.provider, base, secrets[record.provider].secretKey);
  }

  async function deliverWebhook(
    record: CreateRecord,
    status: WebhookStatus,
    options: { fixture?: string; forge?: boolean } = {},
  ): Promise<{ delivered: boolean; statusCode?: number; payload: Record<string, unknown> }> {
    const payload = buildWebhookPayload(record, status, options.fixture);
    if (options.forge) {
      payload.signature = `${'0'.repeat(63)}1`;
    }
    try {
      const res = await fetch(record.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Simulate the gateway egress so the app's real IP allowlist is exercised.
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify(payload),
      });
      return { delivered: true, statusCode: res.status, payload };
    } catch {
      return { delivered: false, payload };
    }
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers['content-type'] ?? '';
      let body: unknown = null;
      if (raw) {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          body = Object.fromEntries(new URLSearchParams(raw));
        } else {
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
        }
      }

      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers as Record<string, string>,
        body,
      });

      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      const sendHtml = (status: number, html: string) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      };
      const redirect = (location: string) => {
        res.writeHead(302, { Location: location });
        res.end();
      };

      const method = req.method ?? '';
      const path = (req.url ?? '').split('?')[0];

      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      void (async () => {
        // ---------------------------------------------------------------- health
        if (method === 'GET' && path === '/__health') {
          send(200, { status: 'ok', provider: 'dummy-gateway' });
          return;
        }

        // -------------------------------------------------------- create session
        for (const provider of ['plutu', 'tlync'] as const) {
          if (method === 'POST' && path === CREATE_PATH[provider]) {
            const override = behavior.failCreate?.[provider];
            if (override) {
              send(override.status ?? 400, override.body ?? { error_message: 'Declined by sandbox' });
              return;
            }
            if (provider === 'plutu') {
              const invalid = !plutuVerifySignature(
                (body as Record<string, unknown>) ?? {},
                secrets.plutu.secretKey,
              );
              if (invalid) {
                send(401, { error_message: 'Invalid signature on create request' });
                return;
              }
            }
            const payload = (body ?? {}) as Record<string, unknown>;
            const sessionId = randomToken('sess');
            const transactionId = randomToken(provider === 'plutu' ? 'txn' : 'tran');
            const record: CreateRecord = {
              provider,
              sessionId,
              transactionId,
              orderId: String(payload.order_id ?? ''),
              amount: Number(payload.amount ?? 0),
              currency: String(payload.currency ?? 'LYD'),
              paymentMethod: DEFAULT_PAYMENT_METHOD[provider],
              callbackUrl: String(payload.callback_url ?? ''),
              returnUrl: String(payload.return_url ?? ''),
            };
            creates.set(sessionId, record);
            if (provider === 'plutu') {
              send(200, {
                payment_url: `${origin}/pay/${sessionId}`,
                session_id: sessionId,
                transaction_id: transactionId,
              });
            } else {
              send(200, {
                payment_url: `${origin}/pay/${sessionId}`,
                session_id: sessionId,
                tran_id: transactionId,
              });
            }
            return;
          }
        }

        // ----------------------------------------------------------- pay page
        if (method === 'GET' && path.startsWith('/pay/')) {
          const sessionId = path.slice('/pay/'.length);
          const record = creates.get(sessionId);
          if (!record) {
            sendHtml(404, '<h1>Unknown payment session</h1>');
            return;
          }
          sendHtml(200, renderPayPage(record, origin));
          return;
        }

        if (method === 'POST' && path.startsWith('/pay/') && path.endsWith('/complete')) {
          const sessionId = path.slice('/pay/'.length, -'/complete'.length);
          const record = creates.get(sessionId);
          if (!record) {
            sendHtml(404, '<h1>Unknown payment session</h1>');
            return;
          }
          const outcome = String((body as Record<string, unknown>)?.outcome ?? 'success');
          if (outcome === 'cancel') {
            // Guest walked away without paying: redirect back with the full
            // returnUrl (query preserved via a real 302) and deliver NO webhook.
            // NB: a GET form to `returnUrl` would drop its query string, so the
            // "return without paying" path must redirect server-side instead.
            redirect(record.returnUrl || `${origin}/pay/${sessionId}`);
            return;
          }
          const status: WebhookStatus = outcome === 'failed' ? 'FAILED' : 'SUCCESS';
          await deliverWebhook(record, status);
          redirect(record.returnUrl || `${origin}/pay/${sessionId}`);
          return;
        }

        // --------------------------------------------------------- control plane
        if (method === 'GET' && path === '/__control/creates') {
          send(200, {
            creates: [...creates.values()].map((r) => ({
              provider: r.provider,
              sessionId: r.sessionId,
              transactionId: r.transactionId,
              orderId: r.orderId,
              amount: r.amount,
              currency: r.currency,
              callbackUrl: r.callbackUrl,
              returnUrl: r.returnUrl,
            })),
          });
          return;
        }

        if (method === 'POST' && path.startsWith('/__control/')) {
          const action = path.slice('/__control/'.length);
          const payload = (body ?? {}) as Record<string, unknown>;

          if (action === 'reset') {
            creates.clear();
            requests.length = 0;
            for (const key of Object.keys(behavior) as (keyof GatewayBehavior)[]) {
              delete behavior[key];
            }
            for (const t of timers) clearTimeout(t);
            timers.length = 0;
            send(200, { ok: true });
            return;
          }

          if (action === 'fail-create') {
            const provider = payload.provider === 'tlync' ? 'tlync' : 'plutu';
            behavior.failCreate = behavior.failCreate ?? {};
            behavior.failCreate[provider] = {
              status: typeof payload.status === 'number' ? payload.status : undefined,
              body: (payload.body as Record<string, unknown>) ?? undefined,
            };
            send(200, { ok: true, provider });
            return;
          }

          const record = creates.get(String(payload.sessionId ?? ''));
          if (!record) {
            send(404, { error_message: 'Unknown sessionId', sessionId: payload.sessionId ?? null });
            return;
          }
          const status = (typeof payload.status === 'string' ? payload.status : 'SUCCESS') as WebhookStatus;
          const fixture = typeof payload.fixture === 'string' ? payload.fixture : undefined;

          if (action === 'settle') {
            const result = await deliverWebhook(record, status, { fixture });
            send(200, { ok: true, ...result });
            return;
          }
          if (action === 'delay') {
            const delayMs = Number(payload.delayMs ?? 3000);
            const timer = globalThis.setTimeout(() => {
              void deliverWebhook(record, status, { fixture });
            }, delayMs);
            timers.push(timer);
            send(200, { ok: true, delayedMs: delayMs });
            return;
          }
          if (action === 'forge') {
            const result = await deliverWebhook(record, status, { forge: true });
            send(200, { ok: true, ...result });
            return;
          }
          if (action === 'duplicate') {
            const first = await deliverWebhook(record, status, { fixture });
            const second = await deliverWebhook(record, status, { fixture });
            send(200, { ok: true, first, second });
            return;
          }

          send(404, { error_message: 'Unknown control action', action });
          return;
        }

        send(404, { error_message: 'Dummy gateway route not found', path });
      })();
    });
  });

  const gateway: DummyGatewayServer = {
    requests,
    behavior,
    port: 0,
    baseUrl: '',
    async start() {
      await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
      const addr = server.address() as AddressInfo;
      gateway.port = addr.port;
      gateway.baseUrl = `http://127.0.0.1:${addr.port}`;
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
    clearRequests() {
      requests.length = 0;
    },
    scheduleDelivery(delayMs, deliver) {
      const timer = globalThis.setTimeout(() => {
        void deliver();
      }, delayMs);
      timers.push(timer);
    },
    clearDeliveries() {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
  };

  return gateway;
}
