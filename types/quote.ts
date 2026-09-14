export type TransactionSide = 'BUY' | 'SELL';

export interface Quote {
  id: string;
  user_id: string;
  side: TransactionSide;
  asset: string; // e.g. USDT
  network: 'base';
  fiat_currency: 'TZS';
  crypto_amount: string; // decimal string, avoid float precision issues
  fiat_amount: string; // amount before fee
  fee_amount: string;
  total_fiat_amount: string; // fiat_amount + fee for BUY, or fiat payout for SELL (fiat_amount - fee)
  exchange_rate: string; // TZS per 1 unit of asset at quote time
  created_at: string;
  expires_at: string;
  consumed: boolean;
}
