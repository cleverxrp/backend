import { UpstreamServiceError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Thin fetch wrapper around the nTZS API.
 *
 * NOTE: Endpoint paths below (`/v1/...`) are placeholders following
 * common payment-provider conventions. Swap them for the exact paths in
 * nTZS's own API reference once you have it — this file is the single
 * place that needs updating.
 */

interface NtzsRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export async function ntzsRequest<T>({ method = 'GET', path, body, idempotencyKey }: NtzsRequestOptions): Promise<T> {
  const baseUrl = process.env.NTZS_API_URL;
  const apiKey = process.env.NTZS_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('nTZS is not configured. Set NTZS_API_URL and NTZS_API_KEY.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      // nTZS is a financial dependency on the critical path — fail fast rather than hang.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error('nTZS request failed to send', { path, method, error: String(err) });
    throw new UpstreamServiceError('nTZS', 'Network error contacting nTZS');
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response; fall through and surface the raw text in the error.
  }

  if (!response.ok) {
    logger.error('nTZS request returned an error', { path, method, status: response.status, body: json ?? text });
    throw new UpstreamServiceError('nTZS', `HTTP ${response.status}`, json ?? text);
  }

  return json as T;
}
