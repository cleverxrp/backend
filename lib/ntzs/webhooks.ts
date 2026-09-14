import { z } from 'zod';

/**
 * Shape of the inbound nTZS webhook body. Adjust field names once you
 * have nTZS's real webhook payload spec — the verification + dedup
 * plumbing around this (lib/security/webhook.ts, idempotency.ts) does
 * not need to change.
 */
export const ntzsWebhookSchema = z.object({
  event: z.enum(['payment.success', 'payment.failed', 'payout.success', 'payout.failed', 'swap.completed', 'swap.failed']),
  id: z.string(), // nTZS's event id — used as the idempotency key
  data: z.object({
    reference: z.string(), // FLOWZA transaction id we passed in at creation time
    paymentId: z.string().optional(),
    payoutId: z.string().optional(),
    swapId: z.string().optional(),
    amount: z.string().optional(),
    paidAmount: z.string().optional(),
    status: z.string().optional(),
  }),
});

export type NtzsWebhookPayload = z.infer<typeof ntzsWebhookSchema>;
