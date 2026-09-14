-- FLOWZA initial schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  firebase_uid text not null unique,
  email text,
  phone text,
  full_name text,
  kyc_status text not null default 'NOT_STARTED'
    check (kyc_status in ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_users_firebase_uid on users (firebase_uid);

-- ─────────────────────────────────────────────
-- WALLETS (customer-provided receive addresses)
-- ─────────────────────────────────────────────
create table if not exists customer_wallets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  network text not null default 'base',
  address text not null,
  label text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, address)
);

-- One-time / pooled deposit addresses issued for SELL transactions.
create table if not exists receiving_addresses (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null,
  address text not null,
  network text not null default 'base',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ─────────────────────────────────────────────
-- QUOTES
-- ─────────────────────────────────────────────
create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  side text not null check (side in ('BUY', 'SELL')),
  asset text not null,
  network text not null default 'base',
  fiat_currency text not null default 'TZS',
  crypto_amount numeric(30, 8) not null,
  fiat_amount numeric(18, 2) not null,
  fee_amount numeric(18, 2) not null,
  total_fiat_amount numeric(18, 2) not null,
  exchange_rate numeric(18, 8) not null,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_quotes_user on quotes (user_id);

-- ─────────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────────
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  quote_id uuid not null references quotes (id),
  side text not null check (side in ('BUY', 'SELL')),
  status text not null,

  asset text not null,
  network text not null default 'base',
  fiat_currency text not null default 'TZS',

  crypto_amount numeric(30, 8) not null,
  fiat_amount numeric(18, 2) not null,
  fee_amount numeric(18, 2) not null,
  total_fiat_amount numeric(18, 2) not null,
  exchange_rate numeric(18, 8) not null,

  destination_address text,
  receiving_address text,

  payment_reference text,
  payout_reference text,
  swap_reference text,
  blockchain_tx_hash text,

  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists idx_transactions_user on transactions (user_id);
create index if not exists idx_transactions_status on transactions (status);
create index if not exists idx_transactions_payment_ref on transactions (payment_reference);
create index if not exists idx_transactions_expires on transactions (expires_at);

-- ─────────────────────────────────────────────
-- LEDGER (double-entry)
-- ─────────────────────────────────────────────
create table if not exists ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  entry_group uuid not null,
  account text not null check (account in (
    'CUSTOMER_FIAT', 'FLOWZA_FIAT_ACCOUNT', 'FLOWZA_CRYPTO_LIQUIDITY',
    'CUSTOMER_CRYPTO', 'FLOWZA_FEE_REVENUE'
  )),
  direction text not null check (direction in ('DEBIT', 'CREDIT')),
  currency text not null check (currency in ('TZS', 'USDT', 'USDC')),
  amount numeric(30, 8) not null,
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_transaction on ledger_entries (transaction_id);
create index if not exists idx_ledger_account_currency on ledger_entries (account, currency);

-- ─────────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────────
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor text not null,
  action text not null,
  transaction_id uuid references transactions (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_transaction on audit_logs (transaction_id);

-- ─────────────────────────────────────────────
-- IDEMPOTENCY (webhook / financial-op dedup)
-- ─────────────────────────────────────────────
create table if not exists idempotency_keys (
  scope text not null,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

-- ─────────────────────────────────────────────
-- KYC RECORDS
-- ─────────────────────────────────────────────
create table if not exists kyc_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  full_name text not null,
  id_type text not null check (id_type in ('NIDA', 'PASSPORT', 'DRIVERS_LICENSE')),
  id_number text not null,
  document_url text not null,
  selfie_url text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_kyc_user on kyc_records (user_id);

-- ─────────────────────────────────────────────
-- updated_at trigger helper
-- ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_transactions_updated_at on transactions;
create trigger trg_transactions_updated_at before update on transactions
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Row Level Security
-- Service-role key (used by the backend) bypasses RLS entirely.
-- These policies only matter if you ever query Supabase directly
-- from a trusted client context using the anon key. Since auth is
-- via Firebase (not Supabase Auth), auth.uid() will only resolve to
-- the Firebase uid if Supabase's "Third-Party Auth" is configured to
-- accept Firebase-issued JWTs — otherwise these policies are inert
-- and every read simply goes through the backend's service-role client.
-- ─────────────────────────────────────────────
alter table users enable row level security;
alter table quotes enable row level security;
alter table transactions enable row level security;
alter table customer_wallets enable row level security;

create policy "Users can read own row" on users
  for select using (auth.uid()::text = firebase_uid);

create policy "Users can read own quotes" on quotes
  for select using (user_id in (select id from users where firebase_uid = auth.uid()::text));

create policy "Users can read own transactions" on transactions
  for select using (user_id in (select id from users where firebase_uid = auth.uid()::text));

create policy "Users can manage own wallets" on customer_wallets
  for all using (user_id in (select id from users where firebase_uid = auth.uid()::text));
