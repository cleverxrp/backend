import type { NextRequest } from 'next/server';
import { getNtzsRate } from '@/lib/ntzs/quotes';
import { ok, fail } from '@/lib/utils/response';
import { rateLimitRequest } from '@/lib/security/rate-limit';

const ASSET = process.env.FLOWZA_BUY_ASSET ?? 'USDT';

export async function GET(req: NextRequest) {
  try {
    rateLimitRequest(req, 'rate.get', 60, 60_000);
    const rate = await getNtzsRate(ASSET);
    return ok(rate);
  } catch (err) {
    return fail(err, { route: 'GET /api/rate' });
  }
}
