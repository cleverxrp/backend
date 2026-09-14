import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { getValidQuote } from '@/lib/services/quote-service';
import { createTransactionFromQuote, listTransactions, getTransactionById } from '@/lib/services/transaction-service';
import { issuePaymentInstruction } from '@/lib/services/payment-service';
import { issueReceivingAddress } from '@/lib/services/deposit-service';
import { assertKycAllowsAmount } from '@/lib/services/compliance-service';
import { ok, fail } from '@/lib/utils/response';
import { parseBody, createTransactionSchema, assertEvmAddress } from '@/lib/utils/validation';
import { ValidationError } from '@/lib/utils/errors';
import { rateLimitRequest } from '@/lib/security/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    const transactions = await listTransactions(ctx.user!.id);
    return ok({ transactions });
  } catch (err) {
    return fail(err, { route: 'GET /api/transactions' });
  }
}

export async function POST(req: NextRequest) {
  try {
    rateLimitRequest(req, 'transactions.create', 15, 60_000);
    const ctx = await requireAuth(req);
    const body = parseBody(createTransactionSchema, await req.json());

    const quote = await getValidQuote(body.quoteId, ctx.user!.id);

    assertKycAllowsAmount(ctx.user!.kyc_status, Number(quote.total_fiat_amount));

    let destinationAddress: string | null = null;
    if (quote.side === 'BUY') {
      if (!body.destinationAddress) {
        throw new ValidationError('destinationAddress is required for BUY transactions');
      }
      destinationAddress = assertEvmAddress(body.destinationAddress);
    }

    const tx = await createTransactionFromQuote(ctx.user!.id, quote, { destinationAddress });

    if (quote.side === 'BUY') {
      if (!body.paymentMethod) {
        throw new ValidationError('paymentMethod is required for BUY transactions');
      }
      const withPayment = await issuePaymentInstruction(tx, body.paymentMethod, {
        phone: body.customerPhone ?? ctx.user!.phone ?? undefined,
        name: ctx.user!.full_name ?? undefined,
      });
      return ok({ transaction: withPayment }, 201);
    }

    // SELL: issue the one-time deposit address the customer must send crypto to.
    const { address, expiresAt } = await issueReceivingAddress(tx);
    const withDeposit = await getTransactionById(tx.id, ctx.user!.id);
    return ok({ transaction: withDeposit, depositAddress: address, depositExpiresAt: expiresAt }, 201);
  } catch (err) {
    return fail(err, { route: 'POST /api/transactions' });
  }
}
