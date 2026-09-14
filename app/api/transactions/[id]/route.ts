import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { getTransactionById } from '@/lib/services/transaction-service';
import { getLedgerForTransaction } from '@/lib/services/ledger-service';
import { ok, fail } from '@/lib/utils/response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth(req);
    const transaction = await getTransactionById(params.id, ctx.user!.id);
    const ledger = await getLedgerForTransaction(transaction.id);
    return ok({ transaction, ledger });
  } catch (err) {
    return fail(err, { route: 'GET /api/transactions/[id]' });
  }
}
