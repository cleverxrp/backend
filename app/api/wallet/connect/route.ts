import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/utils/response';
import { parseBody, connectWalletSchema, assertEvmAddress } from '@/lib/utils/validation';
import { rateLimitRequest } from '@/lib/security/rate-limit';
import type { CustomerWallet } from '@/types/wallet';

export async function POST(req: NextRequest) {
  try {
    rateLimitRequest(req, 'wallet.connect', 10, 60_000);
    const ctx = await requireAuth(req);
    const body = parseBody(connectWalletSchema, await req.json());

    const address = assertEvmAddress(body.address);
    const db = supabaseAdmin();

    const { data, error } = await db
      .from('customer_wallets')
      .upsert(
        { user_id: ctx.user!.id, network: 'base', address, label: body.label ?? null },
        { onConflict: 'user_id,address' },
      )
      .select('*')
      .single();

    if (error) throw error;

    return ok({ wallet: data as CustomerWallet }, 201);
  } catch (err) {
    return fail(err, { route: 'POST /api/wallet/connect' });
  }
}
