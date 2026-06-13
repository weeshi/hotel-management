import { NextRequest, NextResponse } from 'next/server';
import { StripeGateway } from '@/lib/gateways/stripe.gateway';

const stripeGateway = new StripeGateway();

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';

    if (!stripeGateway.verifyWebhook(payload, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    const event = JSON.parse(payload);
    await stripeGateway.handleWebhook({
      type: event.type,
      data: event.data,
      raw: payload,
      signature,
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
