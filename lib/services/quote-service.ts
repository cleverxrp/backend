import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getNtzsRate } from '@/lib/ntzs/quotes';
import { NotFoundError, ValidationError, ConflictError } from '@/lib/utils/errors';
import type { Quote, TransactionSide } from '@/types/quote';

const FEE_BPS = Number(process.env.FLOWZA_FEE_BPS ?? '150'); // 1.5% default
const QUOTE_TTL_SECONDS = Number(process.env.FLOWZA_QUOTE_TTL_SECONDS ?? '120');
const ASSET = process.env.FLOWZA_BUY_ASSET ?? 'USDT';

function round2(n: number): string {
  return n.toFixed(2);
}

function round8(n: number): string {
  return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

interface BuildQuoteInput {
  userId: string;
  side: TransactionSide;
  cryptoAmount?: string;
  fiatAmount?: string;
}

/**
 * Builds a quote from either a target crypto amount or a target fiat
 * amount (exactly one must be supplied — enforced by the request schema).
 * Fee is always expressed in TZS, applied on top for BUY (customer pays
 * more) and deducted for SELL (customer receives less).
 */
export async function createQuote({ userId, side, cryptoAmount, fiatAmount }: BuildQuoteInput): Promise<Quote> {
  const rate = await getNtzsRate(ASSET);
  const rateValue = Number(rate.rate);
  if (!Number.isFinite(rateValue) || rateValue <= 0) {
    throw new ValidationError('nTZS returned an invalid exchange rate');
  }

  let crypto: number;
  let fiatBeforeFee: number;

  if (cryptoAmount) {
    crypto = Number(cryptoAmount);
    fiatBeforeFee = crypto * rateValue;
  } else if (fiatAmount) {
    fiatBeforeFee = Number(fiatAmount);
    crypto = fiatBeforeFee / rateValue;
  } else {
    throw new ValidationError('Provide either cryptoAmount or fiatAmount');
  }

  const fee = (fiatBeforeFee * FEE_BPS) / 10_000;
  const totalFiat = side === 'BUY' ? fiatBeforeFee + fee : fiatBeforeFee - fee;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000);

  const quote: Omit<Quote, 'id'> & { id: string } = {
    id: uuidv4(),
    user_id: userId,
    side,
    asset: ASSET,
    network: 'base',
    fiat_currency: 'TZS',
    crypto_amount: round8(crypto),
    fiat_amount: round2(fiatBeforeFee),
    fee_amount: round2(fee),
    total_fiat_amount: round2(totalFiat),
    exchange_rate: rate.rate,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    consumed: false,
  };

  const db = supabaseAdmin();
  const { data, error } = await db.from('quotes').insert(quote).select('*').single();
  if (error) throw error;

  return data as Quote;
}

export async function getValidQuote(quoteId: string, userId: string): Promise<Quote> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('quotes').select('*').eq('id', quoteId).maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError(`Quote ${quoteId} not found`);
  if (data.user_id !== userId) throw new NotFoundError(`Quote ${quoteId} not found`);
  if (data.consumed) throw new ConflictError('This quote has already been used');
  if (new Date(data.expires_at).getTime() < Date.now()) throw new ConflictError('This quote has expired, request a new one');

  return data as Quote;
}
