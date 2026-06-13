import {
  PaymentGateway,
  PaymentIntentResult,
  AuthorizationResult,
  CaptureResult,
  RefundResult,
  WebhookEvent,
} from './payment-gateway.interface';

export class MobiCashGateway implements PaymentGateway {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = process.env.MOBICASH_API_URL || 'https://api.mobicash.ly/v1';
    this.apiKey = process.env.MOBICASH_API_KEY || '';
    this.apiSecret = process.env.MOBICASH_API_SECRET || '';
  }

  private async request(endpoint: string, data: any, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    return response.json();
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult> {
    const result = await this.request(
      '/payments/create',
      {
        amount: params.amount,
        currency: params.currency,
        description: params.metadata.description || 'حجز فندق',
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mobicash`,
      },
      params.idempotencyKey
    );

    return {
      id: result.payment_id,
      status: result.status === 'pending' ? 'requires_action' : result.status,
      requiresAction: true,
      nextAction: 'qr_code',
      qrCode: result.qr_code,
      redirectUrl: result.redirect_url,
    };
  }

  async authorize(params: { amount: number; currency: string }): Promise<AuthorizationResult> {
    const result = await this.request('/payments/authorize', {
      amount: params.amount,
      currency: params.currency,
    });

    return {
      id: result.authorization_id,
      amount: params.amount,
      status: result.status,
    };
  }

  async capture(authorizationId: string, amount?: number): Promise<CaptureResult> {
    const result = await this.request('/payments/capture', {
      authorization_id: authorizationId,
      amount: amount,
    });

    return { id: result.payment_id, status: result.status };
  }

  async release(authorizationId: string): Promise<void> {
    await this.request('/payments/release', {
      authorization_id: authorizationId,
    });
  }

  async refund(paymentIntentId: string, amount?: number): Promise<RefundResult> {
    const result = await this.request('/payments/refund', {
      payment_id: paymentIntentId,
      amount: amount,
    });

    return {
      id: result.refund_id,
      status: result.status,
      amount: result.amount || amount || 0,
    };
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // MobiCash webhook verification logic
    return signature === this.apiSecret;
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    const { prisma } = require('@/lib/utils/prisma');

    switch (event.type) {
      case 'payment.successful': {
        await prisma.payment.updateMany({
          where: { gatewayPaymentId: event.data.payment_id },
          data: { status: 'SUCCEEDED' },
        });
        break;
      }
      case 'payment.failed': {
        await prisma.payment.updateMany({
          where: { gatewayPaymentId: event.data.payment_id },
          data: { status: 'FAILED' },
        });
        break;
      }
    }
  }
}
