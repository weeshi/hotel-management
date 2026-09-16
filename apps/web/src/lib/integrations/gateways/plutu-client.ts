import { z } from 'zod';

export interface PlutuConfig {
  merchantId: string;
  secretKey: string;
  baseUrl: string; // sandbox vs production
  returnUrl: string;
  callbackUrl: string;
}

export interface PlutuPaymentRequest {
  amount: number;           // in LYD (or configured currency)
  currency: string;         // LYD
  orderId: string;          // our merchantTxId (idempotency key)
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description?: string;
  returnUrl: string;
  callbackUrl: string;
}

export interface PlutuPaymentResponse {
  success: boolean;
  paymentUrl?: string;      // redirect URL for customer
  sessionId?: string;       // Plutu session ID
  transactionId?: string;   // Plutu transaction ID
  error?: string;
  rawResponse?: any;
}

export interface PlutuWebhookPayload {
  transaction_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  payment_method: string;
  signature: string;
  paid_at?: string;
  [key: string]: any;
}

export const plutuWebhookSchema = z.object({
  transaction_id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default('LYD'),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED']),
  payment_method: z.string(),
  signature: z.string().min(1),
  paid_at: z.string().datetime({ offset: true }).optional(),
}).passthrough();

export function getPlutuConfig(): PlutuConfig {
  const merchantId = process.env.PLUTU_MERCHANT_ID || process.env.PLUTU_MERCHANT_ID_DEV || '';
  const secretKey = process.env.PLUTU_SECRET_KEY || process.env.PLUTU_SECRET_KEY_DEV || '';
  const isSandbox = process.env.NODE_ENV !== 'production';
  const overrideBaseUrl = process.env.PLUTU_BASE_URL || process.env.PLUTU_BASE_URL_DEV || '';
  const baseUrl = overrideBaseUrl || (isSandbox
    ? 'https://sandbox.plutu.ly/api/v1'
    : 'https://api.plutu.ly/api/v1');
  const returnUrl = process.env.PLUTU_RETURN_URL || 'https://example.com/payment/return';
  const callbackUrl = process.env.PLUTU_CALLBACK_URL || 'https://example.com/api/external/gateways/plutu/webhook';

  if (!merchantId || !secretKey) {
    console.warn('[Plutu] Credentials not set (PLUTU_MERCHANT_ID / PLUTU_SECRET_KEY) — operations will fail in production');
  }

  return { merchantId, secretKey, baseUrl, returnUrl, callbackUrl };
}

function generatePlutuSignature(params: Record<string, string>, secretKey: string): string {
  const crypto = require('crypto');
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&secret=${secretKey}`;
  return crypto.createHash('sha256').update(signatureString).digest('hex');
}

export async function createPlutuPaymentSession(
  config: PlutuConfig,
  request: PlutuPaymentRequest
): Promise<PlutuPaymentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const signatureParams: Record<string, string> = {
    merchant_id: config.merchantId,
    amount: String(request.amount),
    currency: request.currency,
    order_id: request.orderId,
    customer_name: request.customerName,
    customer_email: request.customerEmail,
    return_url: request.returnUrl,
    callback_url: request.callbackUrl,
  };
  if (request.customerPhone) signatureParams.customer_phone = request.customerPhone;
  if (request.description) signatureParams.description = request.description;

  signatureParams.signature = generatePlutuSignature(signatureParams, config.secretKey);

  try {
    const res = await fetch(`${config.baseUrl}/payment/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(signatureParams),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.payment_url) {
      return {
        success: true,
        paymentUrl: data.payment_url,
        sessionId: data.session_id,
        transactionId: data.transaction_id,
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
      return { success: false, error: 'Plutu create session timeout (30s)' };
    }
    return { success: false, error: err.message || 'Network error' };
  }
}

export function verifyPlutuSignature(
  payload: PlutuWebhookPayload,
  secretKey: string
): boolean {
  if (!payload.signature) return false;

  const params: Record<string, string> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key !== 'signature' && value !== undefined && value !== null) {
      params[key] = String(value);
    }
  });

  const expectedSignature = generatePlutuSignature(params, secretKey);

  const crypto = require('crypto');
  return crypto.timingSafeEqual(
    Buffer.from(payload.signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export function parsePlutuWebhook(rawBody: string): { ok: boolean; data?: PlutuWebhookPayload; error?: string } {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Invalid JSON in webhook payload' };
  }

  const parsed = plutuWebhookSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Validation failed: ${first?.message}` };
  }

  return { ok: true, data: parsed.data };
}

export function getPlutuProviderName(): string {
  return 'plutu';
}