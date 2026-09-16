import http from 'node:http';
import { AddressInfo } from 'node:net';
import crypto from 'node:crypto';

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

export interface DummyGatewayServer {
  readonly baseUrl: string;
  readonly port: number;
  readonly requests: CapturedRequest[];
  behavior: GatewayBehavior;
  start(): Promise<void>;
  close(): Promise<void>;
  clearRequests(): void;
  scheduleDelivery(delayMs: number, deliver: () => Promise<void>): void;
  clearDeliveries(): void;
}

function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export async function createDummyGateway(): Promise<DummyGatewayServer> {
  const requests: CapturedRequest[] = [];
  const behavior: GatewayBehavior = {};
  const timers: NodeJS.Timeout[] = [];
  let closed = false;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
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

      const method = req.method ?? '';
      const path = (req.url ?? '').split('?')[0];

      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      if (method === 'POST' && path === '/payment/create') {
        const override = behavior.failCreate?.plutu;
        if (override) {
          send(override.status ?? 400, override.body ?? { error_message: 'Declined by sandbox' });
          return;
        }
        const sessionId = randomToken('sess');
        const transactionId = randomToken('txn');
        send(200, {
          payment_url: `${origin}/pay/${sessionId}`,
          session_id: sessionId,
          transaction_id: transactionId,
        });
        return;
      }

      if (method === 'POST' && path === '/payment/initiate') {
        const override = behavior.failCreate?.tlync;
        if (override) {
          send(override.status ?? 400, override.body ?? { error_message: 'Declined by sandbox' });
          return;
        }
        const sessionId = randomToken('sess');
        const tranId = randomToken('tran');
        send(200, {
          payment_url: `${origin}/pay/${sessionId}`,
          session_id: sessionId,
          tran_id: tranId,
        });
        return;
      }

      if (method === 'GET' && path.startsWith('/pay/')) {
        send(200, { note: 'Dummy gateway payment page — no real checkout here.' });
        return;
      }

      send(404, { error_message: 'Dummy gateway route not found', path });
    });
  });

  const gateway: DummyGatewayServer = {
    requests,
    behavior,
    port: 0,
    baseUrl: '',
    async start() {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
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