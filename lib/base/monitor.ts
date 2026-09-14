import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { basePublicClient } from './client';
import { resolveTokenAddress, tokenDecimals } from './usdt';

export interface DetectedDeposit {
  txHash: `0x${string}`;
  from: Address;
  to: Address;
  amount: string;
  blockNumber: bigint;
}

/**
 * Looks back over recent blocks for ERC-20 Transfer events into
 * `depositAddress`. This is a fallback path for environments without a
 * webhook provider (Alchemy Notify, QuickNode Streams, etc.) configured —
 * prefer wiring app/api/blockchain/webhook to a real provider in
 * production, and call this only as a reconciliation safety net.
 */
export async function findIncomingTransfers(
  asset: string,
  depositAddress: Address,
  fromBlock: bigint,
): Promise<DetectedDeposit[]> {
  const client = basePublicClient();
  const tokenAddress = resolveTokenAddress(asset);
  const decimals = tokenDecimals(asset);

  const logs = await client.getLogs({
    address: tokenAddress,
    event: {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
    args: { to: depositAddress },
    fromBlock,
  });

  return logs.map((log) => ({
    txHash: log.transactionHash as `0x${string}`,
    from: log.args.from as Address,
    to: log.args.to as Address,
    amount: formatUnits(log.args.value as bigint, decimals),
    blockNumber: log.blockNumber as bigint,
  }));
}
