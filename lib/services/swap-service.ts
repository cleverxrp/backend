import { createNtzsSwap } from '@/lib/ntzs/swaps';
import { applyTransactionEvent, patchTransactionFields } from './transaction-service';
import type { FlowzaTransaction } from '@/types/transaction';

export async function startSwap(tx: FlowzaTransaction): Promise<FlowzaTransaction> {
  const direction = tx.side === 'BUY' ? 'TZS_TO_ASSET' : 'ASSET_TO_TZS';

  const started = await applyTransactionEvent(tx.id, { event: 'SWAP_STARTED' });

  const swap = await createNtzsSwap({
    reference: tx.id,
    direction,
    asset: tx.asset,
    fiatAmount: tx.side === 'BUY' ? tx.fiat_amount : undefined,
    cryptoAmount: tx.side === 'SELL' ? tx.crypto_amount : undefined,
  });

  if (swap.status === 'FAILED') {
    return applyTransactionEvent(started.id, {
      event: 'SWAP_FAILED',
      failureReason: 'nTZS swap failed',
      patch: { swap_reference: swap.swapId },
    });
  }

  if (swap.status === 'PENDING') {
    // nTZS will confirm asynchronously via webhook — see confirmSwapCompleted/confirmSwapFailed.
    // No status change yet (still SWAP_PROCESSING); just persist the swap reference.
    return patchTransactionFields(started.id, { swap_reference: swap.swapId });
  }

  return applyTransactionEvent(started.id, {
    event: 'SWAP_COMPLETED',
    patch: { swap_reference: swap.swapId },
  });
}

/** Called from the nTZS webhook when an async swap finishes. */
export async function confirmSwapCompleted(tx: FlowzaTransaction): Promise<FlowzaTransaction> {
  return applyTransactionEvent(tx.id, { event: 'SWAP_COMPLETED' });
}

/** Called from the nTZS webhook when an async swap fails. */
export async function confirmSwapFailed(tx: FlowzaTransaction, reason: string): Promise<FlowzaTransaction> {
  return applyTransactionEvent(tx.id, { event: 'SWAP_FAILED', failureReason: reason });
}
