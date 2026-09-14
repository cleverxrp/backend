import { RateLimitError } from '@/lib/utils/errors';

/**
 * Fixed-window in-memory rate limiter. This is per-process, so it's
 * sufficient for a single-instance deployment or as a cheap first line
 * of defense, but must be replaced with a shared store (Redis/Upstash)
 * once FLOWZA runs more than one backend instance.
 */
const buckets = new Map<string, { count: number; windowStart: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  if (bucket.count >= limit) {
    throw new RateLimitError(`Rate limit exceeded for ${key}`);
  }

  bucket.count += 1;
}

/** Convenience helper keyed by client IP + route name. */
export function rateLimitRequest(req: Request, routeName: string, limit = 30, windowMs = 60_000): void {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  rateLimit(`${routeName}:${ip}`, limit, windowMs);
}
