import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { ForbiddenError } from '@/lib/utils/errors';
import type { KycStatus } from '@/types/user';

export interface KycSubmission {
  fullName: string;
  idType: 'NIDA' | 'PASSPORT' | 'DRIVERS_LICENSE';
  idNumber: string;
  documentUrl: string;
  selfieUrl?: string;
}

/**
 * Records a KYC submission and moves the user into PENDING review.
 * This MVP does not call an external ID-verification provider — it
 * stores the submission for a human reviewer. Wire this into a real
 * KYC provider (Smile Identity, Onfido, etc.) before real-money launch;
 * the storage shape below is provider-agnostic on purpose.
 */
export async function submitKyc(userId: string, submission: KycSubmission): Promise<KycStatus> {
  const db = supabaseAdmin();

  const { error: insertError } = await db.from('kyc_records').insert({
    id: uuidv4(),
    user_id: userId,
    full_name: submission.fullName,
    id_type: submission.idType,
    id_number: submission.idNumber,
    document_url: submission.documentUrl,
    selfie_url: submission.selfieUrl ?? null,
    status: 'PENDING',
  });
  if (insertError) throw insertError;

  const { error: updateError } = await db.from('users').update({ kyc_status: 'PENDING' }).eq('id', userId);
  if (updateError) throw updateError;

  logger.info('KYC submission recorded', { userId });
  return 'PENDING';
}

export async function getKycStatus(userId: string): Promise<KycStatus> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('users').select('kyc_status').eq('id', userId).single();
  if (error) throw error;
  return data.kyc_status as KycStatus;
}

/** Admin action: approve or reject a pending KYC submission. */
export async function reviewKyc(userId: string, approve: boolean, reviewerNote?: string): Promise<KycStatus> {
  const db = supabaseAdmin();
  const status: KycStatus = approve ? 'APPROVED' : 'REJECTED';

  const { error } = await db.from('users').update({ kyc_status: status }).eq('id', userId);
  if (error) throw error;

  await db
    .from('kyc_records')
    .update({ status, reviewer_note: reviewerNote ?? null, reviewed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  logger.info('KYC reviewed', { userId, status });
  return status;
}

/** Buy/sell limits gate on KYC status — call before creating high-value transactions. */
export function assertKycAllowsAmount(kycStatus: KycStatus, fiatAmountTzs: number): void {
  const KYC_REQUIRED_THRESHOLD_TZS = 1_000_000; // adjust to your regulatory threshold
  if (fiatAmountTzs >= KYC_REQUIRED_THRESHOLD_TZS && kycStatus !== 'APPROVED') {
    throw new ForbiddenError('KYC verification is required before transacting at this amount');
  }
}
