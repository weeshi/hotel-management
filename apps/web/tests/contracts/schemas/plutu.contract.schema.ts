import { z } from 'zod';
import { plutuWebhookSchema } from '@/lib/integrations/gateways/plutu-client';

export const plutuCreateRequestSchema = z
  .object({
    merchant_id: z.string().min(1),
    amount: z.union([z.string(), z.number()]),
    currency: z.string().min(1),
    order_id: z.string().min(1),
    customer_name: z.string().min(1),
    customer_email: z.string(),
    return_url: z.string().url(),
    callback_url: z.string().url(),
    customer_phone: z.string().optional(),
    description: z.string().optional(),
    signature: z.string().min(1),
  })
  .strict();

export const plutuCreateResponseSchema = z
  .object({
    payment_url: z.string().url(),
    session_id: z.string().min(1),
    transaction_id: z.string().min(1),
  })
  .strict();

export type PlutuCreateRequest = z.infer<typeof plutuCreateRequestSchema>;
export type PlutuCreateResponse = z.infer<typeof plutuCreateResponseSchema>;

export { plutuWebhookSchema };
export type { PlutuWebhookPayload } from '@/lib/integrations/gateways/plutu-client';