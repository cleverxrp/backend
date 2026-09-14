import { NextResponse } from 'next/server';
import { AppError } from './errors';
import { logger } from './logger';
import type { ApiResponse } from '@/types/api';

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Converts any thrown value into a well-formed API error response.
 * AppError subclasses map to their own status/code. Anything unexpected
 * is logged with full detail and returned to the client as an opaque
 * 500 — never leak internals (stack traces, DB errors, secrets) to callers.
 */
export function fail(error: unknown, context?: Record<string, unknown>): NextResponse<ApiResponse<never>> {
  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      logger.error(error.message, { code: error.code, details: error.details, ...context });
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: error.code, message: error.message, details: error.details },
      },
      { status: error.httpStatus },
    );
  }

  logger.error('Unhandled error', { error, ...context });
  return NextResponse.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    { status: 500 },
  );
}
