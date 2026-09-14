import { createNtzsPayment, type NtzsPaymentMethod } from '@/lib/ntzs/payments';
import { applyTransactionEvent } from './transaction-service';
import { recordFiatCollection, recordFeeRevenue } from './ledger-service';
import { logger } from '@/lib/utils/logger';
import type { FlowzaTransaction } from '@/types/transaction';

// Allow a small tolerance either way before flagging as under/overpaid —
// mobile money rails frequently clip fractional shillings.
const AMOUNT_TOLERANCE_TZS = 1;

export async function issuePaymentInstruction(
  tx: FlowzaTransaction,
  method: NtzsPaymentMethod,
  customer: { phone?: string; name?: string },
): Promise<FlowzaTransaction> {
  const payment = await createNtzsPayment({
    amount: tx.total_fiat_amount,
    reference: tx.id,
    method,
    customer,
  });

  return applyTransactionEvent(tx.id, {
    event: 'PAYMENT_INSTRUCTION_ISSUED',
    patch: { payment_reference: payment.paymentId, expires_at: payment.expiresAt },
  });
}

/**
 * Applies a payment confirmation received from the nTZS webhook. This is
 * the single choke point for "did the customer actually pay the right
 * amount" — never let a route handler skip straight to PAYMENT_VERIFIED.
 */
export async function handlePaymentConfirmation(
  tx: FlowzaTransaction,
  paidAmount: string,
): Promise<FlowzaTransaction> {
  const expected = Number(tx.total_fiat_amount);
  const paid = Number(paidAmount);
  const diff = paid - expected;

  let received = await applyTransactionEvent(tx.id, { event: 'PAYMENT_WEBHOOK_RECEIVED' });

  if (Math.abs(diff) <= AMOUNT_TOLERANCE_TZS) {
    await recordFiatCollection(tx.id, tx.total_fiat_amount);
    await recordFeeRevenue(tx.id, tx.fee_amount);
    return applyTransactionEvent(received.id, { event: 'PAYMENT_VERIFIED' });
  }

  if (diff < 0) {
    logger.warn('Underpayment detected', { transactionId: tx.id, expected, paid });
    await recordFiatCollection(tx.id, paidAmount);
    return applyTransactionEvent(received.id, {
      event: 'PAYMENT_UNDERPAID',
      failureReason: `Expected ${tx.total_fiat_amount} TZS, received ${paidAmount} TZS`,
    });
  }

  logger.warn('Overpayment detected', { transactionId: tx.id, expected, paid });
  await recordFiatCollection(tx.id, paidAmount);
  return applyTransactionEvent(received.id, {
    event: 'PAYMENT_OVERPAID',
    failureReason: `Expected ${tx.total_fiat_amount} TZS, received ${paidAmount} TZS`,
  });
}

export async function handlePaymentFailure(tx: FlowzaTransaction, reason: string): Promise<FlowzaTransaction> {
  return applyTransactionEvent(tx.id, { event: 'PAYMENT_FAILED', failureReason: reason });
}
