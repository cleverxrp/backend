import { TransactionSide } from './quote';

/**
 * Full transaction status set covering both BUY (fiat -> crypto) and
 * SELL (crypto -> fiat) flows, plus every failure/edge state called out
 * in the FLOWZA roadmap so the system never "blindly" moves money.
 */
export type TransactionStatus =
  | 'CREATED'
  | 'QUOTE_CREATED'
  // BUY path
  | 'WAITING_FOR_PAYMENT'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_VERIFIED'
  | 'SWAP_PROCESSING'
  | 'SWAP_COMPLETED'
  | 'CRYPTO_PROCESSING'
  | 'CRYPTO_SENT'
  | 'CRYPTO_CONFIRMED'
  // SELL path
  | 'WAITING_FOR_CRYPTO'
  | 'CRYPTO_RECEIVED'
  | 'CRYPTO_VERIFIED'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_SENT'
  | 'PAYOUT_CONFIRMED'
  // Terminal success
  | 'COMPLETED'
  // Terminal / recoverable failure states
  | 'PAYMENT_FAILED'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'EXPIRED'
  | 'CRYPTO_FAILED'
  | 'PAYOUT_FAILED'
  | 'REFUND_REQUIRED'
  | 'REFUNDED'
  | 'MANUAL_REVIEW'
  | 'CANCELLED';

export const TERMINAL_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  'COMPLETED',
  'EXPIRED',
  'REFUNDED',
  'CANCELLED',
]);

export interface FlowzaTransaction {
  id: string;
  user_id: string;
  quote_id: string;
  side: TransactionSide;
  status: TransactionStatus;

  asset: string;
  network: 'base';
  fiat_currency: 'TZS';

  crypto_amount: string;
  fiat_amount: string;
  fee_amount: string;
  total_fiat_amount: string;
  exchange_rate: string;

  // BUY: address we send crypto TO. SELL: address funds must arrive FROM (optional, informational).
  destination_address: string | null;
  // SELL: the one-time/pooled address the customer must send crypto to.
  receiving_address: string | null;

  payment_reference: string | null; // nTZS payment/collection reference
  payout_reference: string | null; // nTZS payout reference
  swap_reference: string | null; // nTZS swap reference
  blockchain_tx_hash: string | null;

  failure_reason: string | null;

  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string;
}

/**
 * Events drive transitions. Keeping these explicit (rather than letting
 * callers set `status` directly) is what makes illegal transitions easy
 * to reject in one place: transaction-service.ts.
 */
export type TransactionEvent =
  | 'QUOTE_ATTACHED'
  | 'PAYMENT_INSTRUCTION_ISSUED'
  | 'PAYMENT_WEBHOOK_RECEIVED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_UNDERPAID'
  | 'PAYMENT_OVERPAID'
  | 'PAYMENT_FAILED'
  | 'SWAP_STARTED'
  | 'SWAP_COMPLETED'
  | 'SWAP_FAILED'
  | 'CRYPTO_SEND_STARTED'
  | 'CRYPTO_SEND_BROADCAST'
  | 'CRYPTO_SEND_CONFIRMED'
  | 'CRYPTO_SEND_FAILED'
  | 'DEPOSIT_ADDRESS_ISSUED'
  | 'CRYPTO_DEPOSIT_DETECTED'
  | 'CRYPTO_DEPOSIT_VERIFIED'
  | 'CRYPTO_DEPOSIT_MISMATCH'
  | 'PAYOUT_STARTED'
  | 'PAYOUT_SENT'
  | 'PAYOUT_CONFIRMED'
  | 'PAYOUT_FAILED'
  | 'FLAG_FOR_REVIEW'
  | 'RESOLVE_REVIEW'
  | 'FINALIZE'
  | 'REFUND_ISSUED'
  | 'EXPIRE'
  | 'CANCEL';
