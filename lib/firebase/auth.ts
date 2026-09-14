import type { NextRequest } from 'next/server';
import { firebaseAuth } from './admin';
import { UnauthorizedError } from '@/lib/utils/errors';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AuthContext, FlowzaUser } from '@/types/user';
import { logger } from '@/lib/utils/logger';

/**
 * Verifies the `Authorization: Bearer <idToken>` header against Firebase,
 * then loads (or lazily creates) the matching row in Supabase `users`.
 * Every protected route should call this first — never trust a user id
 * that arrives in the request body.
 */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  let decoded;
  try {
    decoded = await firebaseAuth().verifyIdToken(token);
  } catch (err) {
    logger.warn('Firebase token verification failed', { error: String(err) });
    throw new UnauthorizedError('Invalid or expired session token');
  }

  const firebaseUid = decoded.uid;
  const email = decoded.email ?? null;

  const user = await getOrCreateUser(firebaseUid, email);

  return { firebaseUid, email, user };
}

async function getOrCreateUser(firebaseUid: string, email: string | null): Promise<FlowzaUser> {
  const db = supabaseAdmin();

  const { data: existing, error: findError } = await db
    .from('users')
    .select('*')
    .eq('firebase_uid', firebaseUid)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as FlowzaUser;

  const { data: created, error: insertError } = await db
    .from('users')
    .insert({ firebase_uid: firebaseUid, email, kyc_status: 'NOT_STARTED', is_admin: false })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return created as FlowzaUser;
}

/** Throws ForbiddenError-equivalent behavior unless the caller is an admin. */
export function requireAdmin(ctx: AuthContext): void {
  if (!ctx.user?.is_admin) {
    throw new UnauthorizedError('Admin access required');
  }
}
