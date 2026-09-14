export type KycStatus = 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FlowzaUser {
  id: string; // Supabase row id (uuid)
  firebase_uid: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  kyc_status: KycStatus;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthContext {
  firebaseUid: string;
  email: string | null;
  user: FlowzaUser | null;
}
