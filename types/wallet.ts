export interface CustomerWallet {
  id: string;
  user_id: string;
  network: 'base';
  address: string; // checksummed EVM address, manually entered by the customer
  label: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface ReceivingAddress {
  id: string;
  transaction_id: string;
  address: string; // one-time or pooled deposit address customers send crypto to for SELL flows
  network: 'base';
  created_at: string;
  expires_at: string;
}
