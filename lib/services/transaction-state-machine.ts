import type { TransactionStatus, TransactionEvent } from '@/types/transaction';
import { IllegalTransitionError } from '@/lib/utils/errors';

type TransitionTable = Partial<Record<TransactionStatus, Partial<Record<TransactionEvent, TransactionStatus>>>>;

/**
 * The single source of truth for which (status, event) pairs are legal.
 * Every status change in the system MUST go through `applyTransition` —
 * nothing should ever set `status` directly. This is what lets us
 * reject illegal transitions (e.g. a duplicate webhook trying to move an
 * already-COMPLETED transaction back to CRYPTO_PROCESSING) with a single
 * well-tested check instead of scattered `if` statements.
 */
const TRANSITIONS: TransitionTable = {
  CREATED: {
    QUOTE_ATTACHED: 'QUOTE_CREATED',
    CANCEL: 'CANCELLED',
  },

  // ---- BUY path ----
  QUOTE_CREATED: {
    PAYMENT_INSTRUCTION_ISSUED: 'WAITING_FOR_PAYMENT',
    DEPOSIT_ADDRESS_ISSUED: 'WAITING_FOR_CRYPTO',
    CANCEL: 'CANCELLED',
    EXPIRE: 'EXPIRED',
  },
  WAITING_FOR_PAYMENT: {
    PAYMENT_WEBHOOK_RECEIVED: 'PAYMENT_RECEIVED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    EXPIRE: 'EXPIRED',
    CANCEL: 'CANCELLED',
  },
  PAYMENT_RECEIVED: {
    PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
    PAYMENT_UNDERPAID: 'UNDERPAID',
    PAYMENT_OVERPAID: 'OVERPAID',
    FLAG_FOR_REVIEW: 'MANUAL_REVIEW',
  },
  PAYMENT_VERIFIED: {
    SWAP_STARTED: 'SWAP_PROCESSING',
    // Some assets FLOWZA already holds may skip the swap step entirely.
    CRYPTO_SEND_STARTED: 'CRYPTO_PROCESSING',
  },
  SWAP_PROCESSING: {
    SWAP_COMPLETED: 'SWAP_COMPLETED',
    SWAP_FAILED: 'REFUND_REQUIRED',
  },
  SWAP_COMPLETED: {
    CRYPTO_SEND_STARTED: 'CRYPTO_PROCESSING',
  },
  CRYPTO_PROCESSING: {
    CRYPTO_SEND_BROADCAST: 'CRYPTO_SENT',
    CRYPTO_SEND_FAILED: 'REFUND_REQUIRED',
  },
  CRYPTO_SENT: {
    CRYPTO_SEND_CONFIRMED: 'CRYPTO_CONFIRMED',
    CRYPTO_SEND_FAILED: 'MANUAL_REVIEW',
  },
  CRYPTO_CONFIRMED: {
    // Completion is recorded as its own step so we always have a distinct
    // "settlement confirmed on-chain" vs "transaction closed" timestamp.
    RESOLVE_REVIEW: 'COMPLETED',
    CANCEL: 'COMPLETED', // no-op guard; completion is the natural next step
  },

  // ---- SELL path ----
  WAITING_FOR_CRYPTO: {
    CRYPTO_DEPOSIT_DETECTED: 'CRYPTO_RECEIVED',
    EXPIRE: 'EXPIRED',
    CANCEL: 'CANCELLED',
  },
  CRYPTO_RECEIVED: {
    CRYPTO_DEPOSIT_VERIFIED: 'CRYPTO_VERIFIED',
    CRYPTO_DEPOSIT_MISMATCH: 'MANUAL_REVIEW',
  },
  CRYPTO_VERIFIED: {
    PAYOUT_STARTED: 'PAYOUT_PROCESSING',
  },
  PAYOUT_PROCESSING: {
    PAYOUT_SENT: 'PAYOUT_SENT',
    PAYOUT_FAILED: 'MANUAL_REVIEW',
  },
  PAYOUT_SENT: {
    PAYOUT_CONFIRMED: 'PAYOUT_CONFIRMED',
    PAYOUT_FAILED: 'MANUAL_REVIEW',
  },
  PAYOUT_CONFIRMED: {},

  // ---- Failure / recovery states ----
  UNDERPAID: {
    FLAG_FOR_REVIEW: 'MANUAL_REVIEW',
    REFUND_ISSUED: 'REFUNDED',
  },
  OVERPAID: {
    FLAG_FOR_REVIEW: 'MANUAL_REVIEW',
    REFUND_ISSUED: 'REFUNDED',
  },
  MANUAL_REVIEW: {
    RESOLVE_REVIEW: 'COMPLETED',
    REFUND_ISSUED: 'REFUND_REQUIRED',
    CANCEL: 'CANCELLED',
  },
  REFUND_REQUIRED: {
    REFUND_ISSUED: 'REFUNDED',
  },

  // Terminal states accept no further events.
  COMPLETED: {},
  PAYMENT_FAILED: {},
  CRYPTO_FAILED: {},
  PAYOUT_FAILED: {},
  EXPIRED: {},
  REFUNDED: {},
  CANCELLED: {},
};

export function nextStatus(current: TransactionStatus, event: TransactionEvent): TransactionStatus {
  const next = TRANSITIONS[current]?.[event];
  if (!next) {
    throw new IllegalTransitionError(current, event);
  }
  return next;
}

export function canTransition(current: TransactionStatus, event: TransactionEvent): boolean {
  return Boolean(TRANSITIONS[current]?.[event]);
}
