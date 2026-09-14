import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

/**
 * Records that a given (scope, key) pair has been processed. Backed by a
 * unique constraint on (scope, key) in the `idempotency_keys` table
 * (see supabase/migrations/0001_init.sql), so this is safe under
 * concurrent/duplicate webhook delivery — the DB, not application logic,
 * is the source of truth.
 *
 * Returns `true` if this is the first time we've seen the key (caller
 * should proceed), or `false` if it's a duplicate (caller should
 * short-circuit and return success without redoing any side effects).
 */
export async function claimIdempotencyKey(scope: string, key: string): Promise<boolean> {
  const db = supabaseAdmin();

  const { error } = await db.from('idempotency_keys').insert({ scope, key });

  if (!error) return true;

  // Postgres unique_violation
  if (error.code === '23505') {
    logger.info('Duplicate event ignored via idempotency key', { scope, key });
    return false;
  }

  throw error;
}
