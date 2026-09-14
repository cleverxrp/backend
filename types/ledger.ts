export type LedgerCurrency = 'TZS' | 'USDT' | 'USDC';

export type LedgerAccount =
  | 'CUSTOMER_FIAT'
  | 'FLOWZA_FIAT_ACCOUNT'
  | 'FLOWZA_CRYPTO_LIQUIDITY'
  | 'CUSTOMER_CRYPTO'
  | 'FLOWZA_FEE_REVENUE';

/**
 * Double-entry style ledger line. Every movement of value is written as a
 * pair of entries (one debit, one credit) so FLOWZA can always answer
 * "where did every TZS and every unit of crypto go".
 */
export interface LedgerEntry {
  id: string;
  transaction_id: string;
  entry_group: string; // groups the debit+credit pair produced by one event
  account: LedgerAccount;
  direction: 'DEBIT' | 'CREDIT';
  currency: LedgerCurrency;
  amount: string;
  created_at: string;
  memo: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor: string; // 'system' | firebase_uid | 'webhook:ntzs' | 'webhook:blockchain'
  action: string;
  transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
