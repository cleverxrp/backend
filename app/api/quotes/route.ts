import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { createQuote } from '@/lib/services/quote-service';
import { ok, fail } from '@/lib/utils/response';
import { parseBody, quoteRequestSchema } from '@/lib/utils/validation';
import { rateLimitRequest } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    rateLimitRequest(req, 'quotes.create', 20, 60_000);
    const ctx = await requireAuth(req);
    const body = parseBody(quoteRequestSchema, await req.json());

    const quote = await createQuote({
      userId: ctx.user!.id,
      side: body.side,
      cryptoAmount: body.cryptoAmount,
      fiatAmount: body.fiatAmount,
    });

    return ok({ quote }, 201);
  } catch (err) {
    return fail(err, { route: 'POST /api/quotes' });
  }
}
