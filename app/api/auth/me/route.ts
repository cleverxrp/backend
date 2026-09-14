import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { ok, fail } from '@/lib/utils/response';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    return ok({ user: ctx.user });
  } catch (err) {
    return fail(err, { route: 'GET /api/auth/me' });
  }
}
