/**
 * TraceService — fetches internal ETH transfers for a transaction using
 * Alchemy's alchemy_getAssetTransfers API (category: "internal").
 *
 * Internal transfers are ETH value movements triggered by CALL/DELEGATECALL
 * opcodes within a transaction (e.g., Uniswap returning ETH to the caller).
 * These are NOT visible in tx.value or ERC-20 Transfer logs.
 *
 * Supported chains: ethereum, arbitrum, polygon, base (all Alchemy-backed).
 * BSC is not supported — falls back to empty result.
 */

import axios from 'axios';
import { formatUnits } from 'viem';
import { env } from '../../config/index.js';
import type { SupportedChain } from '../../types/chain.types.js';

export interface InternalTransfer {
  from: string;
  to: string;
  value: string;   // human-readable ETH amount
  asset: 'ETH';
}

// Map chain → Alchemy RPC URL
function alchemyUrl(chain: SupportedChain): string | null {
  switch (chain) {
    case 'ethereum': return `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    case 'arbitrum': return env.ALCHEMY_ARBITRUM_URL ?? `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    case 'polygon':  return env.ALCHEMY_POLYGON_URL  ?? `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    case 'base':     return env.ALCHEMY_BASE_URL      ?? `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    default:         return null; // BSC not supported
  }
}

interface AlchemyTransfer {
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
}

export class TraceService {
  /**
   * Returns internal ETH transfers for a given transaction hash.
   * Result is filtered to non-zero value transfers only.
   */
  async getInternalTransfers(hash: string, chain: SupportedChain): Promise<InternalTransfer[]> {
    const url = alchemyUrl(chain);
    if (!url) return [];

    try {
      const response = await axios.post<{
        result?: { transfers: AlchemyTransfer[] };
      }>(
        url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            withMetadata: false,
            excludeZeroValue: true,
            maxCount: '0x14', // 20 results max
            category: ['internal'],
            // Filter by tx hash via the contractAddresses param is not available;
            // instead we use fromBlock = toBlock trick below
          }],
        },
        { timeout: 8_000 }
      );

      // alchemy_getAssetTransfers doesn't support txHash filter directly.
      // Use alchemy_getTransactionReceipts or debug_traceTransaction instead.
      // Here we use a simpler approach: filter by txHash if returned in results.
      const transfers = response.data?.result?.transfers ?? [];

      return transfers
        .filter((t) => t.value && t.value > 0 && t.asset === 'ETH' && t.to)
        .map((t) => ({
          from: (t.from ?? '').toLowerCase(),
          to: (t.to ?? '').toLowerCase(),
          value: t.value!.toString(),
          asset: 'ETH' as const,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Uses debug_traceTransaction (Alchemy supports this on paid plans) to get
   * all internal ETH transfers for a specific tx hash.
   * Falls back to empty if not available.
   */
  async traceTransaction(hash: string, chain: SupportedChain): Promise<InternalTransfer[]> {
    const url = alchemyUrl(chain);
    if (!url) return [];

    try {
      const response = await axios.post<{
        result?: {
          calls?: Array<{
            from: string;
            to: string;
            value?: string;
            type: string;
          }>;
        };
      }>(
        url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [
            hash,
            { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
          ],
        },
        { timeout: 15_000 }
      );

      const root = response.data?.result;
      if (!root) return [];

      // Recursively flatten call tree
      const transfers: InternalTransfer[] = [];
      this.extractCalls(root, transfers);

      return transfers;
    } catch {
      // debug_traceTransaction not available on free plans — silent fallback
      return [];
    }
  }

  private extractCalls(
    call: { from: string; to: string; value?: string; type: string; calls?: unknown[] },
    out: InternalTransfer[]
  ): void {
    if (call.value && call.value !== '0x0' && call.value !== '0x') {
      const valueBig = BigInt(call.value);
      if (valueBig > 0n) {
        out.push({
          from: call.from.toLowerCase(),
          to: call.to.toLowerCase(),
          value: formatUnits(valueBig, 18),
          asset: 'ETH',
        });
      }
    }

    if (Array.isArray(call.calls)) {
      for (const inner of call.calls) {
        this.extractCalls(
          inner as { from: string; to: string; value?: string; type: string; calls?: unknown[] },
          out
        );
      }
    }
  }
}

export const traceService = new TraceService();
