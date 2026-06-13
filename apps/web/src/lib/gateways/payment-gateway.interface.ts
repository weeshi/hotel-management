export interface PaymentIntentResult {
  id: string;
  clientSecret?: string;
  status: string;
  requiresAction?: boolean;
  nextAction?: 'redirect' | 'qr_code';
  redirectUrl?: string;
  qrCode?: string;
}

export interface AuthorizationResult {
  id: string;
  amount: number;
  status: string;
}

export interface CaptureResult {
  id: string;
  status: string;
}

export interface RefundResult {
  id: string;
  status: string;
  amount: number;
}

export interface WebhookEvent {
  type: string;
  data: any;
  raw: string;
  signature: string;
}

export interface PaymentGateway {
  createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult>;

  authorize(params: {
    amount: number;
    currency: string;
  }): Promise<AuthorizationResult>;

  capture(authorizationId: string, amount?: number): Promise<CaptureResult>;

  release(authorizationId: string): Promise<void>;

  refund(paymentIntentId: string, amount?: number): Promise<RefundResult>;

  verifyWebhook(payload: string, signature: string): boolean;

  handleWebhook(event: WebhookEvent): Promise<void>;
}
