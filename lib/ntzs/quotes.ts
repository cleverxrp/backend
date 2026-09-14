import { ntzsRequest } from './client';

export interface NtzsRateResponse {
  base: string; // e.g. "USDT"
  quote: string; // e.g. "TZS"
  rate: string; // TZS per 1 unit of base
  fetchedAt: string;
}

/** Fetches the current TZS/asset exchange rate FLOWZA should quote against. */
export async function getNtzsRate(asset: string): Promise<NtzsRateResponse> {
  return ntzsRequest<NtzsRateResponse>({
    method: 'GET',
    path: `/v1/rates?base=${encodeURIComponent(asset)}&quote=TZS`,
  });
}
