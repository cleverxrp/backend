import { createPublicClient, createWalletClient, http, type Address, type Chain, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

function resolveChain(): Chain {
  const chainId = Number(process.env.BASE_CHAIN_ID ?? '8453');
  return chainId === baseSepolia.id ? baseSepolia : base;
}

let publicClientSingleton: PublicClient | null = null;

/** Read-only client: balances, transaction receipts, logs. Safe to use anywhere server-side. */
export function basePublicClient(): PublicClient {
  if (publicClientSingleton) return publicClientSingleton;

  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) throw new Error('BASE_RPC_URL is not configured.');

  publicClientSingleton = createPublicClient({
    chain: resolveChain(),
    transport: http(rpcUrl),
  });
  return publicClientSingleton;
}

/**
 * Settlement wallet client — signs and sends outbound crypto transfers.
 * This holds FLOWZA's liquidity private key in memory. In production this
 * should be replaced with a proper signer (KMS, MPC wallet, Fireblocks,
 * Turnkey, etc.) rather than a raw env-var private key.
 */
export function baseSettlementWalletClient(): { client: WalletClient; account: PrivateKeyAccount } {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.SETTLEMENT_WALLET_PRIVATE_KEY;

  if (!rpcUrl) throw new Error('BASE_RPC_URL is not configured.');
  if (!privateKey) throw new Error('SETTLEMENT_WALLET_PRIVATE_KEY is not configured.');

  const normalizedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(normalizedKey);

  const client = createWalletClient({
    account,
    chain: resolveChain(),
    transport: http(rpcUrl),
  });

  return { client, account };
}

export function settlementWalletAddress(): Address {
  const configured = process.env.SETTLEMENT_WALLET_ADDRESS as Address | undefined;
  if (configured) return configured;
  return baseSettlementWalletClient().account.address;
}
