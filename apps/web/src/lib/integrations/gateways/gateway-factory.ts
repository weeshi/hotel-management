import {
  PlutuConfig,
  PlutuPaymentRequest,
  PlutuWebhookPayload,
  createPlutuPaymentSession,
  verifyPlutuSignature,
  parsePlutuWebhook,
  getPlutuConfig,
  getPlutuProviderName,
} from './plutu-client';

import {
  TLyncConfig,
  TLyncPaymentRequest,
  TLyncWebhookPayload,
  createTLyncPaymentSession,
  verifyTLyncSignature,
  parseTLyncWebhook,
  getTLyncConfig,
  getTLyncProviderName,
} from './tlync-client';

export type GatewayName = 'plutu' | 'tlync';

export interface GatewayConfig {
  plutu: PlutuConfig;
  tlync: TLyncConfig;
}

export interface CreatePaymentSessionRequest {
  amount: number;
  currency: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description?: string;
  returnUrl: string;
  callbackUrl: string;
}

export interface CreatePaymentSessionResponse {
  success: boolean;
  paymentUrl?: string;
  sessionId?: string;
  transactionId?: string;
  error?: string;
  rawResponse?: any;
}

export interface WebhookPayload {
  plutu: PlutuWebhookPayload;
  tlync: TLyncWebhookPayload;
}

export interface ParsedWebhook {
  ok: boolean;
  data?: PlutuWebhookPayload | TLyncWebhookPayload;
  error?: string;
}

export interface GatewayAdapter {
  providerName: string;
  config: PlutuConfig | TLyncConfig;
  createPaymentSession(request: CreatePaymentSessionRequest): Promise<CreatePaymentSessionResponse>;
  verifyWebhookSignature(payload: any, secretKey: string): boolean;
  parseWebhook(rawBody: string): ParsedWebhook;
}

// Runtime config overrides merged over the env-derived config.
// Both gateway configs share the same field shape, so callers can pass a
// partial override (typically a test pointing the adapter at a local dummy).
export interface GatewayAdapterOptions {
  config?: Partial<PlutuConfig> & Partial<TLyncConfig>;
}

function buildPlutuAdapter(opts?: GatewayAdapterOptions): GatewayAdapter {
  const config: PlutuConfig = { ...getPlutuConfig(), ...(opts?.config ?? {}) };
  return {
    providerName: getPlutuProviderName(),
    config,
    async createPaymentSession(request): Promise<CreatePaymentSessionResponse> {
      return createPlutuPaymentSession(config, request as PlutuPaymentRequest);
    },
    verifyWebhookSignature(payload, secretKey): boolean {
      return verifyPlutuSignature(payload as PlutuWebhookPayload, secretKey);
    },
    parseWebhook(rawBody): ParsedWebhook {
      return parsePlutuWebhook(rawBody);
    },
  };
}

function buildTLyncAdapter(opts?: GatewayAdapterOptions): GatewayAdapter {
  const config: TLyncConfig = { ...getTLyncConfig(), ...(opts?.config ?? {}) };
  return {
    providerName: getTLyncProviderName(),
    config,
    async createPaymentSession(request): Promise<CreatePaymentSessionResponse> {
      return createTLyncPaymentSession(config, request as TLyncPaymentRequest);
    },
    verifyWebhookSignature(payload, secretKey): boolean {
      return verifyTLyncSignature(payload as TLyncWebhookPayload, secretKey);
    },
    parseWebhook(rawBody): ParsedWebhook {
      return parseTLyncWebhook(rawBody);
    },
  };
}

export function getGatewayAdapter(
  gateway: GatewayName,
  opts?: GatewayAdapterOptions,
): GatewayAdapter {
  switch (gateway) {
    case 'plutu':
      return buildPlutuAdapter(opts);
    case 'tlync':
      return buildTLyncAdapter(opts);
    default:
      throw new Error(`Unsupported gateway: ${String(gateway)}`);
  }
}

export function getSupportedGateways(): GatewayName[] {
  return ['plutu', 'tlync'];
}

export function isGatewaySupported(gateway: string): gateway is GatewayName {
  return gateway === 'plutu' || gateway === 'tlync';
}

export { getPlutuConfig, getTLyncConfig };