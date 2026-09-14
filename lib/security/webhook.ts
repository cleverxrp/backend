import { createHmac, timingSafeEqual } from 'crypto';
import { UnauthorizedError } from '@/lib/utils/errors';

/**
 * Generic HMAC-SHA256 signature check: `HMAC(secret, rawBody)` compared
 * against the signature header, using a constant-time comparison to
 * avoid timing attacks. Both nTZS and blockchain-webhook providers
 * (Alchemy Notify, QuickNode Streams, etc.) use this pattern; adjust the
 * header name / encoding if your provider differs.
 */
export function verifyHmacSignature(rawBody: string, signatureHeader: string | null, secret: string): void {
  if (!signatureHeader) {
    throw new UnauthorizedError('Missing webhook signature');
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const provided = signatureHeader.replace(/^sha256=/, '').trim();

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');

  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new UnauthorizedError('Webhook signature verification failed');
  }
}

export function verifyNtzsWebhook(rawBody: string, signatureHeader: string | null): void {
  const secret = process.env.NTZS_WEBHOOK_SECRET;
  if (!secret) throw new Error('NTZS_WEBHOOK_SECRET is not configured.');
  verifyHmacSignature(rawBody, signatureHeader, secret);
}

export function verifyBlockchainWebhook(rawBody: string, signatureHeader: string | null): void {
  const secret = process.env.BLOCKCHAIN_WEBHOOK_SECRET;
  if (!secret) throw new Error('BLOCKCHAIN_WEBHOOK_SECRET is not configured.');
  verifyHmacSignature(rawBody, signatureHeader, secret);
}
