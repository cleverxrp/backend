import { ntzsRequest } from './client';

export type NtzsPaymentMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER';

export interface CreatePaymentRequest {
  amount: string; // TZS, 2dp
  reference: string; // FLOWZA transaction id, used to reconcile the webhook later
  method: NtzsPaymentMethod;
  customer: {
    phone?: string;
    name?: string;
  };
}

export interface CreatePaymentResponse {
  paymentId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  instructions: {
    // e.g. USSD push details for mobile money, or bank account + reference for bank transfer
    channel: NtzsPaymentMethod;
    displayReference: string;
    ussdPrompted?: boolean;
    bankAccountNumber?: string;
    bankName?: string;
  };
  expiresAt: string;
}

export interface PaymentStatusResponse {
  paymentId: string;
  reference: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  amount: string;
  paidAmount?: string;
  paidAt?: string;
}

/** Initiates a TZS collection (BUY flow, step 5–6 of the roadmap). */
export async function createNtzsPayment(req: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  return ntzsRequest<CreatePaymentResponse>({
    method: 'POST',
    path: '/v1/payments',
    body: req,
    idempotencyKey: req.reference,
  });
}

export async function getNtzsPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  return ntzsRequest<PaymentStatusResponse>({ method: 'GET', path: `/v1/payments/${paymentId}` });
}
