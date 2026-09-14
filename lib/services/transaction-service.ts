import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { nextStatus } from './transaction-state-machine';
import { NotFoundError, ForbiddenError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Quote } from '@/types/quote';
import type { FlowzaTransaction, TransactionEvent } from '@/types/transaction';

const PAYMENT_WINDOW_MINUTES = Number(process.env.FLOWZA_PAYMENT_WINDOW_MINUTES ?? '20');

export async function createTransactionFromQuote(
  userId: string,
  quote: Quote,
  opts: { destinationAddress?: string | null } = {},
): Promise<FlowzaTransaction> {
  const db = supabaseAdmin();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);

  const { data, error } = await db
    .from('transactions')
    .insert({
      id: uuidv4(),
      user_id: userId,
      quote_id: quote.id,
      side: quote.side,
      status: 'QUOTE_CREATED',
      asset: quote.asset,
      network: quote.network,
      fiat_currency: quote.fiat_currency,
      crypto_amount: quote.crypto_amount,
      fiat_amount: quote.fiat_amount,
      fee_amount: quote.fee_amount,
      total_fiat_amount: quote.total_fiat_amount,
      exchange_rate: quote.exchange_rate,
      destination_address: opts.destinationAddress ?? null,
      receiving_address: null,
      payment_reference: null,
      payout_reference: null,
      swap_reference: null,
      blockchain_tx_hash: null,
      failure_reason: null,
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;

  await db.from('quotes').update({ consumed: true }).eq('id', quote.id);

  logger.info('Transaction created', { transactionId: data.id, side: quote.side, userId });
  return data as FlowzaTransaction;
}

export async function getTransactionById(id: string, userId?: string): Promise<FlowzaTransaction> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('transactions').select('*').eq('id', id).maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError(`Transaction ${id} not found`);
  if (userId && data.user_id !== userId) throw new ForbiddenError();

  return data as FlowzaTransaction;
}

export async function findTransactionByReference(reference: string): Promise<FlowzaTransaction> {
  return getTransactionById(reference);
}

export async function listTransactions(userId: string, limit = 50): Promise<FlowzaTransaction[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as FlowzaTransaction[];
}

interface TransitionUpdate {
  event: TransactionEvent;
  patch?: Partial<FlowzaTransaction>;
  failureReason?: string;
}

/**
 * The only sanctioned way to move a transaction forward. Validates the
 * (current status, event) pair against the state machine, persists the
 * new status plus any accompanying fields (references, tx hashes, etc.)
 * in one update, and logs every transition for audit purposes.
 */
export async function applyTransactionEvent(
  transactionId: string,
  { event, patch, failureReason }: TransitionUpdate,
): Promise<FlowzaTransaction> {
  const db = supabaseAdmin();
  const current = await getTransactionById(transactionId);

  const newStatus = nextStatus(current.status, event);

  const update: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...patch,
  };
  if (failureReason) update.failure_reason = failureReason;
  if (newStatus === 'COMPLETED') update.completed_at = new Date().toISOString();

  const { data, error } = await db.from('transactions').update(update).eq('id', transactionId).select('*').single();

  if (error) throw error;

  logger.info('Transaction transitioned', {
    transactionId,
    from: current.status,
    event,
    to: newStatus,
  });

  await db.from('audit_logs').insert({
    id: uuidv4(),
    actor: 'system',
    action: `transaction.${event.toLowerCase()}`,
    transaction_id: transactionId,
    metadata: { from: current.status, to: newStatus },
  });

  return data as FlowzaTransaction;
}

/**
 * Updates non-status fields on a transaction without going through the
 * state machine — for attaching references (e.g. an async swap id) while
 * the status itself is still waiting on a later webhook confirmation.
 * Never pass `status` through this function; use applyTransactionEvent.
 */
export async function patchTransactionFields(
  transactionId: string,
  patch: Partial<Omit<FlowzaTransaction, 'id' | 'status'>>,
): Promise<FlowzaTransaction> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('transactions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', transactionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as FlowzaTransaction;
}

/** Sweeps unpaid/undeposited transactions past their expiry window. Intended to run on a schedule. */
export async function expireStaleTransactions(): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('transactions')
    .select('id, status, expires_at')
    .in('status', ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CRYPTO', 'QUOTE_CREATED'])
    .lt('expires_at', new Date().toISOString());

  if (error) throw error;
  if (!data || data.length === 0) return 0;

  for (const tx of data) {
    try {
      await applyTransactionEvent(tx.id, { event: 'EXPIRE' });
    } catch (err) {
      logger.warn('Failed to expire transaction', { transactionId: tx.id, error: String(err) });
    }
  }

  return data.length;
}
