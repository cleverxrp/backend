import { ntzsRequest } from './client';
import type { NtzsPaymentMethod } from './payments';

export interface CreatePayoutRequest {
  reference: string; // FLOWZA transaction id
  amount: string; // TZS, 2dp
  method: NtzsPaymentMethod;
  destination: {
    phone?: string; // for mobile money
    bankAccountNumber?: string; // for bank transfer
    bankCode?: string;
    accountName?: string;
  };
}

export interface PayoutResponse {
  payoutId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reference: string;
}

/** Disburses TZS to the customer after their crypto deposit is confirmed (SELL flow). */
export async function createNtzsPayout(req: CreatePayoutRequest): Promise<PayoutResponse> {
  return ntzsRequest<PayoutResponse>({
    method: 'POST',
    path: '/v1/payouts',
    body: req,
    idempotencyKey: `${req.reference}:payout`,
  });
}

export async function getNtzsPayoutStatus(payoutId: string): Promise<PayoutResponse> {
  return ntzsRequest<PayoutResponse>({ method: 'GET', path: `/v1/payouts/${payoutId}` });
}
