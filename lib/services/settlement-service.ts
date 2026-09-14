import { assertEvmAddress } from '@/lib/utils/validation';
import { sendTokenFromSettlementWallet, waitForConfirmation } from '@/lib/base/usdt';
import { applyTransactionEvent } from './transaction-service';
import { recordCryptoPayout } from './ledger-service';
import { ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { FlowzaTransaction } from '@/types/transaction';

/**
 * Broadcasts the outbound crypto transfer for a BUY transaction. Returns
 * immediately after broadcast (status CRYPTO_SENT) — confirmation is a
 * separate step so the transaction record always reflects reality even
 * if the process crashes between broadcast and confirmation.
 */
export async function sendSettlement(tx: FlowzaTransaction): Promise<FlowzaTransaction> {
  if (!tx.destination_address) {
    throw new ValidationError('Transaction has no destination address to send crypto to');
  }
  const to = assertEvmAddress(tx.destination_address);

  const processing = await applyTransactionEvent(tx.id, { event: 'CRYPTO_SEND_STARTED' });

  try {
    const hash = await sendTokenFromSettlementWallet(tx.asset, to, tx.crypto_amount);
    return applyTransactionEvent(processing.id, {
      event: 'CRYPTO_SEND_BROADCAST',
      patch: { blockchain_tx_hash: hash },
    });
  } catch (err) {
    logger.error('sendSettlement failed', { transactionId: tx.id, error: String(err) });
    return applyTransactionEvent(processing.id, {
      event: 'CRYPTO_SEND_FAILED',
      failureReason: 'Failed to broadcast settlement transfer',
    });
  }
}

/** Waits for on-chain confirmation and closes out the transaction. */
export async function confirmSettlement(tx: FlowzaTransaction): Promise<FlowzaTransaction> {
  if (!tx.blockchain_tx_hash) {
    throw new ValidationError('Transaction has no broadcast tx hash to confirm');
  }

  try {
    await waitForConfirmation(tx.blockchain_tx_hash as `0x${string}`);
  } catch (err) {
    logger.error('confirmSettlement failed', { transactionId: tx.id, error: String(err) });
    return applyTransactionEvent(tx.id, {
      event: 'CRYPTO_SEND_FAILED',
      failureReason: 'Transaction did not confirm on-chain',
    });
  }

  await recordCryptoPayout(tx.id, tx.crypto_amount, tx.asset === 'USDC' ? 'USDC' : 'USDT');
  const confirmed = await applyTransactionEvent(tx.id, { event: 'CRYPTO_SEND_CONFIRMED' });
  return applyTransactionEvent(confirmed.id, { event: 'RESOLVE_REVIEW' });
}
