import type { NextRequest } from 'next/server';
import { verifyNtzsWebhook } from '@/lib/security/webhook';
import { claimIdempotencyKey } from '@/lib/security/idempotency';
import { ntzsWebhookSchema } from '@/lib/ntzs/webhooks';
import { getTransactionById } from '@/lib/services/transaction-service';
import { handlePaymentConfirmation, handlePaymentFailure } from '@/lib/services/payment-service';
import { confirmPayout } from '@/lib/services/payout-service';
import { applyTransactionEvent } from '@/lib/services/transaction-service';
import { confirmSwapCompleted, confirmSwapFailed } from '@/lib/services/swap-service';
import { ok, fail } from '@/lib/utils/response';
import { logger } from '@/lib/utils/logger';

/**
 * nTZS is the trusted signal for "did the customer actually pay" — the
 * frontend saying "I paid" is never sufficient (see security notes in
 * the README). This handler: verifies the signature, deduplicates by
 * event id, then routes to the right service. Every branch is wrapped so
 * one bad event can't crash the whole webhook and cause nTZS to keep
 * retrying a poison payload forever.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    verifyNtzsWebhook(rawBody, req.headers.get('x-ntzs-signature'));
  } catch (err) {
    return fail(err, { route: 'POST /api/payments/webhook', stage: 'signature' });
  }

  let payload;
  try {
    payload = ntzsWebhookSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn('Malformed nTZS webhook payload', { error: String(err) });
    return fail(err, { route: 'POST /api/payments/webhook', stage: 'parse' });
  }

  const isNew = await claimIdempotencyKey('ntzs-webhook', payload.id);
  if (!isNew) {
    // Already processed this exact event — acknowledge without redoing side effects.
    return ok({ deduplicated: true });
  }

  try {
    const tx = await getTransactionById(payload.data.reference);

    switch (payload.event) {
      case 'payment.success':
        await handlePaymentConfirmation(tx, payload.data.paidAmount ?? payload.data.amount ?? tx.total_fiat_amount);
        break;
      case 'payment.failed':
        await handlePaymentFailure(tx, 'nTZS reported payment failure');
        break;
      case 'payout.success':
        await confirmPayout(tx);
        break;
      case 'payout.failed':
        await applyTransactionEvent(tx.id, { event: 'PAYOUT_FAILED', failureReason: 'nTZS reported payout failure' });
        break;
      case 'swap.completed':
        await confirmSwapCompleted(tx);
        break;
      case 'swap.failed':
        await confirmSwapFailed(tx, 'nTZS reported swap failure');
        break;
      default:
        logger.warn('Unhandled nTZS webhook event type', { event: payload.event });
    }

    return ok({ received: true });
  } catch (err) {
    return fail(err, { route: 'POST /api/payments/webhook', eventId: payload.id, event: payload.event });
  }
}
