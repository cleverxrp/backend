import { ntzsRequest } from './client';

export interface CreateSwapRequest {
  reference: string; // FLOWZA transaction id
  direction: 'TZS_TO_ASSET' | 'ASSET_TO_TZS';
  asset: string; // e.g. USDT
  fiatAmount?: string; // required for TZS_TO_ASSET
  cryptoAmount?: string; // required for ASSET_TO_TZS
}

export interface SwapResponse {
  swapId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  fiatAmount: string;
  cryptoAmount: string;
  rate: string;
}

/** Converts collected TZS into the settlement asset, or vice versa, via nTZS liquidity. */
export async function createNtzsSwap(req: CreateSwapRequest): Promise<SwapResponse> {
  return ntzsRequest<SwapResponse>({
    method: 'POST',
    path: '/v1/swaps',
    body: req,
    idempotencyKey: `${req.reference}:swap`,
  });
}

export async function getNtzsSwapStatus(swapId: string): Promise<SwapResponse> {
  return ntzsRequest<SwapResponse>({ method: 'GET', path: `/v1/swaps/${swapId}` });
}
