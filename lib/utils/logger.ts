/**
 * Minimal structured logger. Swap the `write` implementation for a real
 * sink (Datadog, Logtail, Supabase logs table, etc.) in production —
 * every call site in this codebase already goes through here, so that's
 * a one-file change.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'password',
  'privatekey',
  'private_key',
  'secret',
  'token',
  'webhooksecret',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase().replace(/[_-]/g, '')) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.FLOWZA_ENV !== 'production') write('debug', message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
