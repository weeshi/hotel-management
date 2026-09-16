import { z } from 'zod';

export interface TLyncConfig {
  merchantId: string;
  secretKey: string;
  baseUrl: string;
  returnUrl: string;
  callbackUrl: string;
}

export interface TLyncPaymentRequest {
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

export interface TLyncPaymentResponse {
  success: boolean;
  paymentUrl?: string;
  sessionId?: string;
  transactionId?: string;
  error?: string;
  rawResponse?: any;
}

export interface TLyncWebhookPayload {
  tran_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' | 'EXPIRED';
  payment_method: string;
  signature: string;
  paid_at?: string;
  [key: string]: any;
}

export const tlyncWebhookSchema = z.object({
  tran_id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default('LYD'),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED', 'EXPIRED']),
  payment_method: z.string(),
  signature: z.string().min(1),
  paid_at: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export function getTLyncConfig(): TLyncConfig {
  const merchantId = process.env.TLYNC_MERCHANT_ID || process.env.TLYNC_MERCHANT_ID_DEV || '';
  const secretKey = process.env.TLYNC_SECRET_KEY || process.env.TLYNC_SECRET_KEY_DEV || '';
  const isSandbox = process.env.NODE_ENV !== 'production';
  const overrideBaseUrl = process.env.TLYNC_BASE_URL || process.env.TLYNC_BASE_URL_DEV || '';
  const baseUrl = overrideBaseUrl || (isSandbox
    ? 'https://sandbox.tlync.ly/api/v1'
    : 'https://api.tlync.ly/api/v1');
  const returnUrl = process.env.TLYNC_RETURN_URL || 'https://example.com/payment/return';
  const callbackUrl = process.env.TLYNC_CALLBACK_URL || 'https://example.com/api/external/gateways/tlync/webhook';

  if (!merchantId || !secretKey) {
    console.warn('[T-Lync] Credentials not set (TLYNC_MERCHANT_ID / TLYNC_SECRET_KEY) — operations will fail in production');
  }

  return { merchantId, secretKey, baseUrl, returnUrl, callbackUrl };
}

function generateTLyncSignature(payload: TLyncWebhookPayload, secretKey: string): string {
  const crypto = require('crypto');
  const sortedKeys = Object.keys(payload).filter(k => k !== 'signature').sort();
  const signatureString = sortedKeys.map(k => `${k}=${String(payload[k])}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(signatureString).digest('hex');
}

export async function createTLyncPaymentSession(
  config: TLyncConfig,
  request: TLyncPaymentRequest
): Promise<TLyncPaymentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const body = {
    merchant_id: config.merchantId,
    amount: request.amount,
    currency: request.currency,
    order_id: request.orderId,
    customer_name: request.customerName,
    customer_email: request.customerEmail,
    customer_phone: request.customerPhone,
    description: request.description,
    return_url: request.returnUrl,
    callback_url: request.callbackUrl,
  };

  try {
    const res = await fetch(`${config.baseUrl}/payment/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.payment_url) {
      return {
        success: true,
        paymentUrl: data.payment_url,
        sessionId: data.session_id,
        transactionId: data.tran_id,
        rawResponse: data,
      };
    }

    return {
      success: false,
      error: data.error_message || data.message || `HTTP ${res.status}: ${JSON.stringify(data)}`,
      rawResponse: data,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: 'T-Lync create session timeout (30s)' };
    }
    return { success: false, error: err.message || 'Network error' };
  }
}

export function verifyTLyncSignature(
  payload: TLyncWebhookPayload,
  secretKey: string
): boolean {
  if (!payload.signature) return false;

  const expectedSignature = generateTLyncSignature(payload, secretKey);

  const crypto = require('crypto');
  return crypto.timingSafeEqual(
    Buffer.from(payload.signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export function parseTLyncWebhook(rawBody: string): { ok: boolean; data?: TLyncWebhookPayload; error?: string } {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Invalid JSON in webhook payload' };
  }

  const parsed = tlyncWebhookSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Validation failed: ${first?.message}` };
  }

  return { ok: true, data: parsed.data };
}

export function getTLyncProviderName(): string {
  return 'tlync';
}