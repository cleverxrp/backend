import { createHash } from 'crypto';
import { mnemonicToAccount } from 'viem/accounts';

/**
 * FLOWZA's SELL flow needs to attribute an incoming on-chain transfer to
 * a specific transaction. Rather than asking every customer to send an
 * exact amount to one shared address (fragile — amounts can be fat-
 * fingered), each SELL transaction gets its own deposit address derived
 * from a single mnemonic via a standard BIP-44 path. Funds landing on
 * any derived address are swept into the main settlement wallet once
 * confirmed (see monitor.ts / a scheduled sweep job you add later).
 *
 * The mnemonic itself is as sensitive as a private key holding all
 * customer deposits — treat HD_WALLET_MNEMONIC with the same care as
 * SETTLEMENT_WALLET_PRIVATE_KEY (ideally: a KMS/HSM, not a raw env var).
 */
export function deriveDepositAccount(index: number) {
  const mnemonic = process.env.HD_WALLET_MNEMONIC;
  if (!mnemonic) throw new Error('HD_WALLET_MNEMONIC is not configured.');

  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

/**
 * Deterministically maps a transaction id to a stable, well-distributed
 * derivation index so the same transaction always resolves to the same
 * address (idempotent — calling this twice for the same tx is safe).
 */
export function derivationIndexForTransaction(transactionId: string): number {
  const hash = createHash('sha256').update(transactionId).digest();
  // Keep within a safe range for BIP-44 non-hardened address indices.
  return hash.readUInt32BE(0) % 0x7fffffff;
}
