import type { NextRequest } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/firebase/auth';
import { getReconciliationSummary } from '@/lib/services/ledger-service';
import { ok, fail } from '@/lib/utils/response';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requireAdmin(ctx);

    const summary = await getReconciliationSummary();
    return ok({ summary });
  } catch (err) {
    return fail(err, { route: 'GET /api/ledger/reconciliation' });
  }
}
