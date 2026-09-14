import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyBlockchainWebhook } from '@/lib/security/webhook';
import { claimIdempotencyKey } from '@/lib/security/idempotency';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTransactionById } from '@/lib/services/transaction-service';
import { handleCryptoDeposit } from '@/lib/services/deposit-service';
import { ok, fail } from '@/lib/utils/response';
import { logger } from '@/lib/utils/logger';

/**
 * Normalized payload this route expects. Address-activity webhook
 * providers (Alchemy Notify, QuickNode Streams, Moralis Streams, etc.)
 * each use their own envelope — add a small adapter here to reshape
 * their payload into this `transfers[]` array rather than changing
 * anything downstream.
 */
const blockchainWebhookSchema = z.object({
  eventId: z.string(),
  transfers: z.array(
    z.object({
      to: z.string(),
      amount: z.string(),
      asset: z.string(),
      txHash: z.string(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    verifyBlockchainWebhook(rawBody, req.headers.get('x-webhook-signature'));
  } catch (err) {
    return fail(err, { route: 'POST /api/blockchain/webhook', stage: 'signature' });
  }

  let payload;
  try {
    payload = blockchainWebhookSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn('Malformed blockchain webhook payload', { error: String(err) });
    return fail(err, { route: 'POST /api/blockchain/webhook', stage: 'parse' });
  }

  const isNew = await claimIdempotencyKey('blockchain-webhook', payload.eventId);
  if (!isNew) return ok({ deduplicated: true });

  const db = supabaseAdmin();
  const results: Array<{ txHash: string; status: string }> = [];

  for (const transfer of payload.transfers) {
    try {
      const { data: deposit, error } = await db
        .from('receiving_addresses')
        .select('transaction_id')
        .eq('address', transfer.to)
        .maybeSingle();

      if (error) throw error;

      if (!deposit) {
        // Transfer to an address FLOWZA doesn't recognize — log and skip rather than fail the batch.
        logger.warn('Deposit to unrecognized address', { to: transfer.to, txHash: transfer.txHash });
        results.push({ txHash: transfer.txHash, status: 'unrecognized_address' });
        continue;
      }

      const tx = await getTransactionById(deposit.transaction_id);
      await handleCryptoDeposit(tx, transfer.amount, transfer.txHash);
      results.push({ txHash: transfer.txHash, status: 'processed' });
    } catch (err) {
      logger.error('Failed to process blockchain deposit', { txHash: transfer.txHash, error: String(err) });
      results.push({ txHash: transfer.txHash, status: 'error' });
    }
  }

  return ok({ results });
}
