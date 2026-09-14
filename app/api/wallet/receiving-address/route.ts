import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/firebase/auth';
import { getTransactionById } from '@/lib/services/transaction-service';
import { issueReceivingAddress } from '@/lib/services/deposit-service';
import { ok, fail } from '@/lib/utils/response';
import { parseBody } from '@/lib/utils/validation';

const schema = z.object({ transactionId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    const { transactionId } = parseBody(schema, await req.json());

    const tx = await getTransactionById(transactionId, ctx.user!.id);
    const result = await issueReceivingAddress(tx);

    return ok(result, 201);
  } catch (err) {
    return fail(err, { route: 'POST /api/wallet/receiving-address' });
  }
}
