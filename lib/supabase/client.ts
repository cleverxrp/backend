import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Anon-key client. Respects Row Level Security. Safe to use for any
 * request path that should only ever see data a normal (non-service-role)
 * caller is allowed to see. Most backend logic should use
 * `lib/supabase/admin.ts` instead; this exists for completeness /
 * for routes that intentionally want RLS enforcement rather than bypassing it.
 */
export function supabasePublic(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
