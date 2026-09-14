import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/utils/response';

/**
 * Admins can see the full ledger (needed for reconciliation); regular
 * customers only ever see ledger lines tied to their own transactions —
 * enforced here rather than relying on RLS, since this route runs under
 * the service-role client.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    const db = supabaseAdmin();

    let query = db.from('ledger_entries').select('*, transactions!inner(user_id)').order('created_at', { ascending: false }).limit(200);

    if (!ctx.user!.is_admin) {
      query = query.eq('transactions.user_id', ctx.user!.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ok({ entries: data ?? [] });
  } catch (err) {
    return fail(err, { route: 'GET /api/ledger' });
  }
}
