import {
  PlutuConfig,
  PlutuPaymentRequest,
  PlutuPaymentResponse,
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
  TLyncPaymentResponse,
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

const plutuAdapter: GatewayAdapter = {
  providerName: getPlutuProviderName(),
  config: getPlutuConfig(),
  async createPaymentSession(request): Promise<CreatePaymentSessionResponse> {
    return createPlutuPaymentSession(this.config as PlutuConfig, request as PlutuPaymentRequest);
  },
  verifyWebhookSignature(payload, secretKey): boolean {
    return verifyPlutuSignature(payload as PlutuWebhookPayload, secretKey);
  },
  parseWebhook(rawBody): ParsedWebhook {
    return parsePlutuWebhook(rawBody);
  },
};

const tlyncAdapter: GatewayAdapter = {
  providerName: getTLyncProviderName(),
  config: getTLyncConfig(),
  async createPaymentSession(request): Promise<CreatePaymentSessionResponse> {
    return createTLyncPaymentSession(this.config as TLyncConfig, request as TLyncPaymentRequest);
  },
  verifyWebhookSignature(payload, secretKey): boolean {
    return verifyTLyncSignature(payload as TLyncWebhookPayload, secretKey);
  },
  parseWebhook(rawBody): ParsedWebhook {
    return parseTLyncWebhook(rawBody);
  },
};

const ADAPTERS: Record<GatewayName, GatewayAdapter> = {
  plutu: plutuAdapter,
  tlync: tlyncAdapter,
};

export function getGatewayAdapter(gateway: GatewayName): GatewayAdapter {
  const adapter = ADAPTERS[gateway];
  if (!adapter) {
    throw new Error(`Unsupported gateway: ${gateway}`);
  }
  return adapter;
}

export function getSupportedGateways(): GatewayName[] {
  return Object.keys(ADAPTERS) as GatewayName[];
}

export function isGatewaySupported(gateway: string): gateway is GatewayName {
  return gateway in ADAPTERS;
}

export { getPlutuConfig, getTLyncConfig };