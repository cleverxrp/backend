# FLOWZA Backend

TZS ⇄ crypto (USDT/USDC) settlement backend for FLOWZA, built on Next.js API
routes, Firebase Auth, Supabase Postgres, nTZS (fiat rails), and Base
(blockchain).

This is the **backend only**. It has no pages — every route lives under
`app/api/*` and returns JSON.

## Stack

| Concern | Technology |
|---|---|
| API runtime | Next.js 14 App Router (route handlers) |
| Auth | Firebase Authentication (ID token verification) |
| Database | Supabase Postgres |
| TZS rails | nTZS (payments, payouts, swaps) |
| Blockchain | Base, via `viem` |
| Validation | Zod |
| Deployment | Vercel |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values — see below
```

Run the Supabase schema:

```bash
# via Supabase CLI
supabase db push
# — or paste supabase/migrations/0001_init.sql into the Supabase SQL editor
```

```bash
npm run dev       # http://localhost:4000
npm run typecheck # tsc --noEmit
npm run build     # production build
```

## ⚠️ Before you go live — things this codebase deliberately leaves for you

1. **USDT vs USDC.** Your architecture doc specifies USDT; your earlier
   product decisions (and the Next.js/SQLite build previously delivered)
   used USDC with confirmed Circle contract addresses. Both are wired up
   here (`lib/base/usdt.ts`), selectable via `FLOWZA_BUY_ASSET` /
   `FLOWZA_SELL_ASSET`, but **the USDT contract address on Base is left
   blank** (`FLOWZA_ASSET_CONTRACT_ADDRESS`) — confirm the canonical
   address before sending real funds. Sending to the wrong ERC-20
   contract address is unrecoverable.
2. **nTZS endpoint paths are placeholders.** `lib/ntzs/*.ts` follows
   common payment-provider REST conventions (`POST /v1/payments`, etc.)
   because nTZS's exact API reference wasn't available while building
   this. Update those paths/payload shapes once you have nTZS's docs —
   everything downstream (services, routes, ledger) is written against
   the TypeScript interfaces in those files, not the URLs, so it's a
   contained change.
3. **Settlement wallet key management.** `SETTLEMENT_WALLET_PRIVATE_KEY`
   as a raw env var is fine for development. Before production, move to
   a KMS/HSM/MPC signer (Fireblocks, Turnkey, AWS KMS, etc.) — this file
   (`lib/base/client.ts`) is the only place that needs to change.
4. **HD deposit wallet.** SELL transactions get a unique deposit address
   derived from `HD_WALLET_MNEMONIC` (see "Attributing SELL deposits"
   below). This mnemonic controls all customer deposits — treat it with
   at least as much care as the settlement private key, and build a
   sweep job that moves funds from derived addresses into the main
   settlement wallet.
5. **Blockchain webhook provider.** `app/api/blockchain/webhook` expects
   a normalized `{ eventId, transfers: [{ to, amount, asset, txHash }] }`
   body. Real providers (Alchemy Notify, QuickNode Streams, Moralis
   Streams) each have their own envelope — add a small adapter to
   reshape their payload before it reaches the schema in that file.
6. **KYC provider.** `lib/services/compliance-service.ts` stores
   submissions for manual review; it does not call an ID-verification
   vendor. Wire in Smile Identity / Onfido / similar before relying on
   it for real compliance.

None of the above block local development or testing the flows end to
end with mocked/sandbox credentials — they're the specific gaps between
"this compiles and the state machine is correct" and "this moves real
money safely."

## Architecture

```text
Client (mobile/web app)
   │  Authorization: Bearer <Firebase ID token>
   ▼
Next.js API routes (app/api/*)
   │
   ├── lib/firebase   → verifies session, loads/creates Supabase user row
   ├── lib/supabase   → service-role Postgres access (source of truth)
   ├── lib/ntzs       → TZS collection, payout, swap
   ├── lib/base       → Base RPC, ERC-20 transfer, deposit address derivation
   ├── lib/security   → webhook signature verification, idempotency, rate limiting
   └── lib/services   → orchestration: quote → transaction → payment/swap/settlement → ledger
```

### Transaction state machine

Every transaction moves through explicit states (see
`types/transaction.ts` and `lib/services/transaction-state-machine.ts`).
State changes only ever happen through `applyTransactionEvent`, which
checks the (current status, event) pair against a transition table and
throws `IllegalTransitionError` for anything not explicitly allowed —
this is what makes a duplicate or out-of-order webhook a no-op instead
of a double payout.

**BUY** (customer pays TZS, receives crypto):

```text
CREATED → QUOTE_CREATED → WAITING_FOR_PAYMENT → PAYMENT_RECEIVED
        → PAYMENT_VERIFIED → SWAP_PROCESSING → SWAP_COMPLETED
        → CRYPTO_PROCESSING → CRYPTO_SENT → CRYPTO_CONFIRMED → COMPLETED
```

**SELL** (customer sends crypto, receives TZS):

```text
CREATED → QUOTE_CREATED → WAITING_FOR_CRYPTO → CRYPTO_RECEIVED
        → CRYPTO_VERIFIED → PAYOUT_PROCESSING → PAYOUT_SENT
        → PAYOUT_CONFIRMED → COMPLETED
```

**Failure / edge states**, reachable from the relevant point in either
flow: `UNDERPAID`, `OVERPAID`, `PAYMENT_FAILED`, `CRYPTO_FAILED`,
`PAYOUT_FAILED`, `EXPIRED`, `REFUND_REQUIRED`, `REFUNDED`,
`MANUAL_REVIEW`, `CANCELLED`.

### Attributing SELL deposits

FLOWZA can't rely on customers sending an exact amount to one shared
address, so every SELL transaction gets its **own** deposit address,
derived deterministically from `HD_WALLET_MNEMONIC` via
`derivationIndexForTransaction()` (a stable hash of the transaction id →
BIP-44 address index). The blockchain webhook looks up which transaction
owns an incoming transfer by matching the `to` address against
`receiving_addresses`, so attribution doesn't depend on amount-matching
at all — the amount is instead verified afterward as a fraud check.

### Ledger

`lib/services/ledger-service.ts` writes double-entry pairs
(`ledger_entries`) for every economic event — fiat collected, crypto
paid out, crypto collected, fiat paid out, fee revenue. Nothing is ever
updated or deleted from this table. `GET /api/ledger/reconciliation`
(admin-only) sums balances per account/currency, so "where did every TZS
and every unit of crypto go" always has a direct, computed answer.

### Security

- **Never trust the frontend.** Payment/deposit confirmation only ever
  comes from a verified nTZS or blockchain webhook.
- **Webhook signatures** are verified with constant-time HMAC comparison
  (`lib/security/webhook.ts`) before the body is even parsed.
- **Idempotency**: every webhook event id is claimed via a unique
  constraint in Postgres (`idempotency_keys`) before any side effect
  runs — duplicate deliveries are acknowledged and ignored, not
  reprocessed.
- **Rate limiting** on quote/transaction/KYC creation endpoints
  (in-memory; swap for Redis once you run more than one instance).
- **KYC gating**: `assertKycAllowsAmount` blocks transactions above a
  configurable TZS threshold unless the user's KYC status is `APPROVED`.

## API reference

All authenticated routes expect `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user profile (creates the Supabase row on first call) |
| GET | `/api/wallet` | List the caller's saved receiving wallets |
| POST | `/api/wallet/connect` | Register a manually-entered Base address |
| POST | `/api/wallet/receiving-address` | Issue a one-time SELL deposit address for a transaction |
| GET | `/api/rate` | Current TZS/asset exchange rate |
| POST | `/api/quotes` | Create a BUY or SELL quote |
| GET | `/api/transactions` | List the caller's transactions |
| POST | `/api/transactions` | Create a transaction from a quote (starts payment instruction or deposit address) |
| GET | `/api/transactions/:id` | Transaction detail + its ledger trail |
| POST | `/api/payments/webhook` | nTZS webhook (payment/payout/swap events) — signed, idempotent |
| POST | `/api/blockchain/webhook` | Blockchain deposit-detection webhook — signed, idempotent |
| POST | `/api/send/broadcast` | Admin: advance a stuck BUY transaction through swap → send → confirm |
| GET / POST | `/api/compliance/kyc` | Check / submit KYC |
| GET | `/api/ledger` | Ledger entries (own transactions, or all as admin) |
| GET | `/api/ledger/reconciliation` | Admin: net balance per account/currency |

## Project structure

```text
backend/
├── app/api/                 # Route handlers — thin; delegate to lib/services
├── lib/
│   ├── firebase/             # Admin SDK + requireAuth/requireAdmin
│   ├── supabase/              # Service-role + anon clients
│   ├── ntzs/                  # Payment/payout/swap/rate/webhook clients
│   ├── base/                  # viem clients, ERC-20 helpers, deposit derivation
│   ├── services/               # Business logic + the transaction state machine
│   ├── security/               # Webhook verification, idempotency, rate limiting
│   └── utils/                   # Errors, logging, response helpers, validation
├── types/                    # Shared TypeScript types
├── supabase/migrations/      # SQL schema
├── middleware.ts             # CORS + security headers for /api/*
├── .env.example
└── package.json
```
