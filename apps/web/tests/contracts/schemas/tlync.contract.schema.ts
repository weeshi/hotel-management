import { z } from 'zod';
import { tlyncWebhookSchema } from '@/lib/integrations/gateways/tlync-client';

export const tlyncCreateRequestSchema = z
  .object({
    merchant_id: z.string().min(1),
    amount: z.number(),
    currency: z.string().min(1),
    order_id: z.string().min(1),
    customer_name: z.string().min(1),
    customer_email: z.string(),
    customer_phone: z.string().optional(),
    description: z.string().optional(),
    return_url: z.string().url(),
    callback_url: z.string().url(),
  })
  .passthrough();

export const tlyncCreateResponseSchema = z
  .object({
    payment_url: z.string().url(),
    session_id: z.string().min(1),
    tran_id: z.string().min(1),
  })
  .strict();

export type TLyncCreateRequest = z.infer<typeof tlyncCreateRequestSchema>;
export type TLyncCreateResponse = z.infer<typeof tlyncCreateResponseSchema>;

export { tlyncWebhookSchema };
export type { TLyncWebhookPayload } from '@/lib/integrations/gateways/tlync-client';