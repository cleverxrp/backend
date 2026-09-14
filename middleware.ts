import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs before every request. Authentication itself happens per-route via
 * `requireAuth` (so each handler controls exactly when a user record is
 * created/loaded) — this layer only handles cross-cutting concerns that
 * apply uniformly: CORS and baseline security headers.
 */
export function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }), req);
  }

  const res = NextResponse.next();
  return withCors(withSecurityHeaders(res), req);
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const allowedOrigin = process.env.FLOWZA_ALLOWED_ORIGIN ?? '*';
  res.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-NTZS-Signature, X-Webhook-Signature');
  return res;
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
