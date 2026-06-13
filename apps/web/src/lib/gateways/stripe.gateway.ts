import {
  PaymentGateway,
  PaymentIntentResult,
  AuthorizationResult,
  CaptureResult,
  RefundResult,
  WebhookEvent,
} from './payment-gateway.interface';

export class StripeGateway implements PaymentGateway {
  private stripe: any;

  constructor() {
    const Stripe = require('stripe');
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult> {
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: Math.round(params.amount * 100),
        currency: params.currency.toLowerCase(),
        metadata: params.metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: params.idempotencyKey }
    );

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
      requiresAction: paymentIntent.status === 'requires_action',
    };
  }

  async authorize(params: {
    amount: number;
    currency: string;
  }): Promise<AuthorizationResult> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: params.currency.toLowerCase(),
      capture_method: 'manual',
    });

    return {
      id: paymentIntent.id,
      amount: params.amount,
      status: paymentIntent.status,
    };
  }

  async capture(authorizationId: string, amount?: number): Promise<CaptureResult> {
    const captureParams: any = {};
    if (amount) {
      captureParams.amount_to_capture = Math.round(amount * 100);
    }

    const paymentIntent = await this.stripe.paymentIntents.capture(
      authorizationId,
      captureParams
    );

    return { id: paymentIntent.id, status: paymentIntent.status };
  }

  async release(authorizationId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(authorizationId);
  }

  async refund(paymentIntentId: string, amount?: number): Promise<RefundResult> {
    const refundParams: any = { payment_intent: paymentIntentId };
    if (amount) refundParams.amount = Math.round(amount * 100);

    const refund = await this.stripe.refunds.create(refundParams);

    return {
      id: refund.id,
      status: refund.status,
      amount: refund.amount / 100,
    };
  }

  verifyWebhook(payload: string, signature: string): boolean {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    const { prisma } = require('@/lib/utils/prisma');

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        await prisma.payment.updateMany({
          where: { gatewayPaymentId: pi.id },
          data: { status: 'SUCCEEDED' },
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await prisma.payment.updateMany({
          where: { gatewayPaymentId: pi.id },
          data: { status: 'FAILED' },
        });
        break;
      }
    }
  }
}
