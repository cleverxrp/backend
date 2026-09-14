import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { LedgerAccount, LedgerCurrency, LedgerEntry } from '@/types/ledger';

interface LedgerLeg {
  account: LedgerAccount;
  direction: 'DEBIT' | 'CREDIT';
  currency: LedgerCurrency;
  amount: string;
}

/**
 * Writes a balanced group of ledger legs for one economic event (e.g.
 * "customer paid TZS", "FLOWZA sent USDT"). Every call should pass legs
 * that net to zero per currency — callers in payment/payout/swap
 * services are responsible for constructing the correct pair(s).
 */
export async function recordLedgerEvent(transactionId: string, memo: string, legs: LedgerLeg[]): Promise<void> {
  const db = supabaseAdmin();
  const entryGroup = uuidv4();

  const rows = legs.map((leg) => ({
    id: uuidv4(),
    transaction_id: transactionId,
    entry_group: entryGroup,
    account: leg.account,
    direction: leg.direction,
    currency: leg.currency,
    amount: leg.amount,
    memo,
  }));

  const { error } = await db.from('ledger_entries').insert(rows);
  if (error) throw error;
}

/** Records the customer's TZS payment landing in FLOWZA's fiat account (BUY flow). */
export async function recordFiatCollection(transactionId: string, amount: string) {
  await recordLedgerEvent(transactionId, 'Customer TZS payment collected', [
    { account: 'CUSTOMER_FIAT', direction: 'DEBIT', currency: 'TZS', amount },
    { account: 'FLOWZA_FIAT_ACCOUNT', direction: 'CREDIT', currency: 'TZS', amount },
  ]);
}

/** Records FLOWZA sending crypto out of its liquidity to the customer's wallet (BUY flow). */
export async function recordCryptoPayout(transactionId: string, amount: string, currency: LedgerCurrency) {
  await recordLedgerEvent(transactionId, 'Crypto sent to customer wallet', [
    { account: 'FLOWZA_CRYPTO_LIQUIDITY', direction: 'DEBIT', currency, amount },
    { account: 'CUSTOMER_CRYPTO', direction: 'CREDIT', currency, amount },
  ]);
}

/** Records a customer's crypto deposit landing in FLOWZA's liquidity wallet (SELL flow). */
export async function recordCryptoCollection(transactionId: string, amount: string, currency: LedgerCurrency) {
  await recordLedgerEvent(transactionId, 'Customer crypto deposit received', [
    { account: 'CUSTOMER_CRYPTO', direction: 'DEBIT', currency, amount },
    { account: 'FLOWZA_CRYPTO_LIQUIDITY', direction: 'CREDIT', currency, amount },
  ]);
}

/** Records FLOWZA paying TZS out to the customer (SELL flow). */
export async function recordFiatPayout(transactionId: string, amount: string) {
  await recordLedgerEvent(transactionId, 'TZS payout sent to customer', [
    { account: 'FLOWZA_FIAT_ACCOUNT', direction: 'DEBIT', currency: 'TZS', amount },
    { account: 'CUSTOMER_FIAT', direction: 'CREDIT', currency: 'TZS', amount },
  ]);
}

export async function recordFeeRevenue(transactionId: string, amount: string, currency: LedgerCurrency = 'TZS') {
  await recordLedgerEvent(transactionId, 'FLOWZA fee revenue', [
    { account: 'FLOWZA_FIAT_ACCOUNT', direction: 'DEBIT', currency, amount },
    { account: 'FLOWZA_FEE_REVENUE', direction: 'CREDIT', currency, amount },
  ]);
}

export async function getLedgerForTransaction(transactionId: string): Promise<LedgerEntry[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('ledger_entries')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}

/**
 * Reconciliation summary: net balance per (account, currency) across all
 * time. In production this should be paired with periodic snapshots
 * rather than scanning the whole table, but for MVP volumes a direct
 * aggregation is fine and always exactly correct.
 */
export async function getReconciliationSummary() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('ledger_entries').select('account, currency, direction, amount');
  if (error) throw error;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const key = `${row.account}:${row.currency}`;
    const signed = row.direction === 'CREDIT' ? Number(row.amount) : -Number(row.amount);
    totals.set(key, (totals.get(key) ?? 0) + signed);
  }

  return Array.from(totals.entries()).map(([key, balance]) => {
    const [account, currency] = key.split(':');
    return { account, currency, balance: balance.toFixed(8) };
  });
}
