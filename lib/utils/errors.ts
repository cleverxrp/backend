/**
 * All predictable failure cases should throw one of these so route
 * handlers can map them to the right HTTP status + error code without
 * guessing. Anything else (a genuine bug) is left to bubble up as a
 * 500 and gets logged with full detail server-side only.
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: string, message: string, httpStatus = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with current state') {
    super('CONFLICT', message, 409);
  }
}

export class IllegalTransitionError extends AppError {
  constructor(from: string, event: string) {
    super(
      'ILLEGAL_TRANSITION',
      `Transaction cannot handle event "${event}" while in status "${from}"`,
      409,
    );
  }
}

export class UpstreamServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super('UPSTREAM_SERVICE_ERROR', `${service}: ${message}`, 502, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429);
  }
}
