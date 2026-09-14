import { type Address, parseUnits, formatUnits } from 'viem';
import { basePublicClient, baseSettlementWalletClient } from './client';
import { UpstreamServiceError, ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Known settlement-asset contracts on Base. USDC addresses are the
 * official Circle-issued contracts. Verify the USDT address against
 * Base's official token list before relying on it in production —
 * it is left blank/env-driven on purpose rather than guessed.
 */
export const TOKEN_CONTRACTS: Record<string, { mainnet?: Address; sepolia?: Address; decimals: number }> = {
  USDC: {
    mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    decimals: 6,
  },
  USDT: {
    // Intentionally left for env override — confirm the canonical address before production use.
    decimals: 6,
  },
};

export function resolveTokenAddress(asset: string): Address {
  const envOverride = process.env.FLOWZA_ASSET_CONTRACT_ADDRESS as Address | undefined;
  if (envOverride) return envOverride;

  const isTestnet = process.env.BASE_CHAIN_ID === '84532';
  const entry = TOKEN_CONTRACTS[asset.toUpperCase()];
  const address = isTestnet ? entry?.sepolia : entry?.mainnet;

  if (!address) {
    throw new ValidationError(
      `No contract address configured for asset "${asset}". Set FLOWZA_ASSET_CONTRACT_ADDRESS.`,
    );
  }
  return address;
}

export function tokenDecimals(asset: string): number {
  return TOKEN_CONTRACTS[asset.toUpperCase()]?.decimals ?? 6;
}

export async function getTokenBalance(asset: string, owner: Address): Promise<string> {
  const client = basePublicClient();
  const tokenAddress = resolveTokenAddress(asset);
  const decimals = tokenDecimals(asset);

  const raw = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });

  return formatUnits(raw as bigint, decimals);
}

/**
 * Sends `amount` of `asset` from the FLOWZA settlement wallet to `to`.
 * Returns the broadcast transaction hash immediately — callers must
 * still wait for confirmation (see monitor.ts) before treating the
 * transaction as complete.
 */
export async function sendTokenFromSettlementWallet(asset: string, to: Address, amount: string): Promise<`0x${string}`> {
  const { client, account } = baseSettlementWalletClient();
  const tokenAddress = resolveTokenAddress(asset);
  const decimals = tokenDecimals(asset);
  const value = parseUnits(amount, decimals);

  try {
    const hash = await client.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, value],
      account,
      chain: client.chain,
    });
    logger.info('Broadcast settlement transfer', { asset, to, amount, hash });
    return hash;
  } catch (err) {
    logger.error('Settlement transfer failed to broadcast', { asset, to, amount, error: String(err) });
    throw new UpstreamServiceError('Base', 'Failed to broadcast settlement transfer', { cause: String(err) });
  }
}

export async function waitForConfirmation(hash: `0x${string}`, confirmations = 1) {
  const client = basePublicClient();
  return client.waitForTransactionReceipt({ hash, confirmations });
}

export { ERC20_ABI };
