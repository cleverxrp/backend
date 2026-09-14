import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '@/lib/firebase/auth';
import { getTransactionById } from '@/lib/services/transaction-service';
import { startSwap } from '@/lib/services/swap-service';
import { sendSettlement, confirmSettlement } from '@/lib/services/settlement-service';
import { ok, fail } from '@/lib/utils/response';
import { parseBody } from '@/lib/utils/validation';
import { ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

const schema = z.object({ transactionId: z.string().uuid() });

/**
 * Advances a PAYMENT_VERIFIED BUY transaction through swap -> broadcast ->
 * confirm. In production this is normally triggered automatically right
 * after `handlePaymentConfirmation` (see payment-service.ts / the webhook
 * route) rather than called by a client — this endpoint is kept as an
 * admin-triggered/manual-retry path for transactions that got stuck
 * (e.g. after a crash between steps) and therefore requires admin auth.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requireAdmin(ctx);

    const { transactionId } = parseBody(schema, await req.json());
    let tx = await getTransactionById(transactionId);

    if (tx.side !== 'BUY') {
      throw new ValidationError('Only BUY transactions broadcast an outbound settlement transfer');
    }

    if (tx.status === 'PAYMENT_VERIFIED') {
      tx = await startSwap(tx);
    }
    if (tx.status === 'SWAP_COMPLETED') {
      tx = await sendSettlement(tx);
    }
    if (tx.status === 'CRYPTO_SENT') {
      tx = await confirmSettlement(tx);
    }

    return ok({ transaction: tx });
  } catch (err) {
    logger.error('send/broadcast failed', { error: String(err) });
    return fail(err, { route: 'POST /api/send/broadcast' });
  }
}
