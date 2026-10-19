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

import {
  resolveGatewayConfig,
  GatewayConfigReadError,
  gatewayConfigReadErrorToMessage,
} from './gateway-config';

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
  createPaymentSession(
    request: CreatePaymentSessionRequest,
    resolvedConfig?: PlutuConfig | TLyncConfig
  ): Promise<CreatePaymentSessionResponse>;
  verifyWebhookSignature(payload: any, secretKey: string): boolean;
  parseWebhook(rawBody: string): ParsedWebhook;
}

// Runtime config overrides merged over the env-derived config.
// Both gateway configs share the same field shape, so callers can pass a
// partial override (typically a test pointing the adapter at a local dummy).
// `hotelId` makes createPaymentSession resolve the hotel's stored credentials
// from IntegrationConfig (see gateway-config.ts) when no explicit config is
// passed.
export interface GatewayAdapterOptions {
  config?: Partial<PlutuConfig> & Partial<TLyncConfig>;
  hotelId?: string;
}

function buildPlutuAdapter(opts?: GatewayAdapterOptions): GatewayAdapter {
  const envConfig = getPlutuConfig();
  const config: PlutuConfig = { ...envConfig, ...(opts?.config ?? {}) };

  const resolvePlutuConfig = async (): Promise<PlutuConfig> => {
    const resolution = await resolveGatewayConfig('plutu', {
      hotelId: opts?.hotelId,
      override: opts?.config,
    });
    if (!resolution.ok) {
      throw new GatewayConfigReadError(
        gatewayConfigReadErrorToMessage(resolution.reason),
        resolution.reason
      );
    }
    return resolution.config as PlutuConfig;
  };

  return {
    providerName: getPlutuProviderName(),
    config,
    async createPaymentSession(
      request,
      resolvedConfig?
    ): Promise<CreatePaymentSessionResponse> {
      const finalConfig = resolvedConfig ?? (await resolvePlutuConfig());
      return createPlutuPaymentSession(finalConfig, request as PlutuPaymentRequest);
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
  const envConfig = getTLyncConfig();
  const config: TLyncConfig = { ...envConfig, ...(opts?.config ?? {}) };

  const resolveTLyncConfig = async (): Promise<TLyncConfig> => {
    const resolution = await resolveGatewayConfig('tlync', {
      hotelId: opts?.hotelId,
      override: opts?.config,
    });
    if (!resolution.ok) {
      throw new GatewayConfigReadError(
        gatewayConfigReadErrorToMessage(resolution.reason),
        resolution.reason
      );
    }
    return resolution.config as TLyncConfig;
  };

  return {
    providerName: getTLyncProviderName(),
    config,
    async createPaymentSession(
      request,
      resolvedConfig?
    ): Promise<CreatePaymentSessionResponse> {
      const finalConfig = resolvedConfig ?? (await resolveTLyncConfig());
      return createTLyncPaymentSession(finalConfig, request as TLyncPaymentRequest);
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