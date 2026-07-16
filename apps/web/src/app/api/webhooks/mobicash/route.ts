import { NextRequest, NextResponse } from 'next/server';
import { MobiCashGateway } from '@/lib/gateways/mobicash.gateway';

const mobicashGateway = new MobiCashGateway();

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';

    if (!mobicashGateway.verifyWebhook(payload, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    const event = JSON.parse(payload);
    await mobicashGateway.handleWebhook({
      type: event.event || event.type,
      data: event.data || event,
      raw: payload,
      signature,
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('MobiCash webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
