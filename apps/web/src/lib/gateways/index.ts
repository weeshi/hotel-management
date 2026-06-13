import { PaymentGateway } from './payment-gateway.interface';
import { StripeGateway } from './stripe.gateway';
import { MobiCashGateway } from './mobicash.gateway';

const gateways = new Map<string, PaymentGateway>();

export function getPaymentGateway(name: string): PaymentGateway {
  if (!gateways.has(name)) {
    switch (name) {
      case 'stripe':
        gateways.set(name, new StripeGateway());
        break;
      case 'mobicash':
        gateways.set(name, new MobiCashGateway());
        break;
      default:
        throw new Error(`بوابة دفع غير معروفة: ${name}`);
    }
  }

  return gateways.get(name)!;
}

export type { PaymentGateway } from './payment-gateway.interface';
export { StripeGateway } from './stripe.gateway';
export { MobiCashGateway } from './mobicash.gateway';
