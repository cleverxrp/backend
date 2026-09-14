import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/utils/response';
import type { CustomerWallet } from '@/types/wallet';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    const db = supabaseAdmin();

    const { data, error } = await db
      .from('customer_wallets')
      .select('*')
      .eq('user_id', ctx.user!.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ok({ wallets: (data ?? []) as CustomerWallet[] });
  } catch (err) {
    return fail(err, { route: 'GET /api/wallet' });
  }
}
