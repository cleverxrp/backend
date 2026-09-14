import { deriveDepositAccount, derivationIndexForTransaction } from '@/lib/base/hd-wallet';
import { applyTransactionEvent } from './transaction-service';
import { recordCryptoCollection } from './ledger-service';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { FlowzaTransaction } from '@/types/transaction';

const DEPOSIT_WINDOW_MINUTES = Number(process.env.FLOWZA_PAYMENT_WINDOW_MINUTES ?? '20');

export async function issueReceivingAddress(tx: FlowzaTransaction): Promise<{ address: string; expiresAt: string }> {
  if (tx.side !== 'SELL') {
    throw new ValidationError('Receiving addresses are only issued for SELL transactions');
  }

  const index = derivationIndexForTransaction(tx.id);
  const account = deriveDepositAccount(index);
  const expiresAt = new Date(Date.now() + DEPOSIT_WINDOW_MINUTES * 60_000).toISOString();

  const db = supabaseAdmin();
  const { error } = await db.from('receiving_addresses').insert({
    id: uuidv4(),
    transaction_id: tx.id,
    address: account.address,
    network: 'base',
    expires_at: expiresAt,
  });
  if (error) throw error;

  await applyTransactionEvent(tx.id, {
    event: 'DEPOSIT_ADDRESS_ISSUED',
    patch: { receiving_address: account.address, expires_at: expiresAt },
  });

  logger.info('Issued SELL deposit address', { transactionId: tx.id, address: account.address });
  return { address: account.address, expiresAt };
}

/**
 * Called once a deposit is detected on-chain (webhook or monitor sweep).
 * Verifies the amount matches what the quote promised within tolerance,
 * then records the ledger movement and advances the state machine.
 */
export async function handleCryptoDeposit(
  tx: FlowzaTransaction,
  detectedAmount: string,
  txHash: string,
): Promise<FlowzaTransaction> {
  const expected = Number(tx.crypto_amount);
  const received = Number(detectedAmount);
  // Crypto amounts should match exactly (no rounding ambiguity like mobile money), but
  // allow a hair of tolerance for token dust / rebasing edge cases.
  const tolerance = expected * 0.001;

  const detected = await applyTransactionEvent(tx.id, {
    event: 'CRYPTO_DEPOSIT_DETECTED',
    patch: { blockchain_tx_hash: txHash },
  });

  if (Math.abs(received - expected) > tolerance) {
    logger.warn('SELL deposit amount mismatch', { transactionId: tx.id, expected, received });
    return applyTransactionEvent(detected.id, {
      event: 'CRYPTO_DEPOSIT_MISMATCH',
      failureReason: `Expected ${tx.crypto_amount} ${tx.asset}, received ${detectedAmount} ${tx.asset}`,
    });
  }

  await recordCryptoCollection(tx.id, detectedAmount, tx.asset === 'USDC' ? 'USDC' : 'USDT');
  return applyTransactionEvent(detected.id, { event: 'CRYPTO_DEPOSIT_VERIFIED' });
}
