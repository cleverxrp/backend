import { z, ZodSchema } from 'zod';
import { isAddress, getAddress } from 'viem';
import { ValidationError } from './errors';

export function parseBody<T>(schema: ZodSchema<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Request body failed validation', result.error.flatten());
  }
  return result.data;
}

/** Validates and returns a checksummed EVM address, or throws. */
export function assertEvmAddress(address: string): `0x${string}` {
  if (!isAddress(address)) {
    throw new ValidationError(`"${address}" is not a valid Base (EVM) address`);
  }
  return getAddress(address);
}

// ---- Shared request schemas ----

export const quoteRequestSchema = z.object({
  side: z.enum(['BUY', 'SELL']),
  // Exactly one of cryptoAmount / fiatAmount should be supplied.
  cryptoAmount: z.string().regex(/^\d+(\.\d{1,8})?$/).optional(),
  fiatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
}).refine((v) => Boolean(v.cryptoAmount) !== Boolean(v.fiatAmount), {
  message: 'Provide exactly one of cryptoAmount or fiatAmount',
});

export const createTransactionSchema = z.object({
  quoteId: z.string().uuid(),
  // Required for BUY (where the crypto should be sent), optional/informational for SELL.
  destinationAddress: z.string().optional(),
  paymentMethod: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER']).optional(),
  customerPhone: z.string().optional(),
});

export const connectWalletSchema = z.object({
  address: z.string(),
  label: z.string().max(64).optional(),
});

export const kycSubmitSchema = z.object({
  fullName: z.string().min(2).max(120),
  idType: z.enum(['NIDA', 'PASSPORT', 'DRIVERS_LICENSE']),
  idNumber: z.string().min(4).max(64),
  documentUrl: z.string().url(),
  selfieUrl: z.string().url().optional(),
});
