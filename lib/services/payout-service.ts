import { createNtzsPayout } from '@/lib/ntzs/transfers';
import type { NtzsPaymentMethod } from '@/lib/ntzs/payments';
import { applyTransactionEvent } from './transaction-service';
import { recordFiatPayout, recordFeeRevenue } from './ledger-service';
import type { FlowzaTransaction } from '@/types/transaction';

export async function startPayout(
  tx: FlowzaTransaction,
  method: NtzsPaymentMethod,
  destination: { phone?: string; bankAccountNumber?: string; bankCode?: string; accountName?: string },
): Promise<FlowzaTransaction> {
  const processing = await applyTransactionEvent(tx.id, { event: 'PAYOUT_STARTED' });

  const payout = await createNtzsPayout({
    reference: tx.id,
    amount: tx.total_fiat_amount,
    method,
    destination,
  });

  if (payout.status === 'FAILED') {
    return applyTransactionEvent(processing.id, {
      event: 'PAYOUT_FAILED',
      failureReason: 'nTZS payout failed',
      patch: { payout_reference: payout.payoutId },
    });
  }

  const sent = await applyTransactionEvent(processing.id, {
    event: 'PAYOUT_SENT',
    patch: { payout_reference: payout.payoutId },
  });

  await recordFiatPayout(tx.id, tx.total_fiat_amount);
  await recordFeeRevenue(tx.id, tx.fee_amount);

  return sent;
}

/** Called once the nTZS webhook confirms the payout actually landed. */
export async function confirmPayout(tx: FlowzaTransaction): Promise<FlowzaTransaction> {
  return applyTransactionEvent(tx.id, { event: 'PAYOUT_CONFIRMED' });
}
