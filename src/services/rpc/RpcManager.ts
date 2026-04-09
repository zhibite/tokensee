import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, bsc, arbitrum, polygon, base, optimism, avalanche, zkSync, linea, scroll, polygonZkEvm, mantle, gnosis, metis, boba, blast, mode } from 'viem/chains';
import { env } from '../../config/index.js';
import type { SupportedChain } from '../../types/chain.types.js';

/** Simplified block data used internally — avoids complex viem Promise types */
export interface BlockData {
  number: bigint;
  timestamp: bigint;
  transactions: Array<{
    hash: `0x${string}`;
    from: `0x${string}`;
    to: `0x${string}` | null;
    value: bigint;
  }>;
}

/** Simple in-memory cache for block numbers */
interface BlockCache {
  blockNumber: bigint;
  timestamp: number;
}

const blockCache: Map<SupportedChain, BlockCache> = new Map();
const CACHE_TTL_MS = 5_000;

interface ChainClients {
  primary: PublicClient;
  fallback?: PublicClient;
}

let clients: Map<SupportedChain, ChainClients> | null = null;

/**
 * RPC Provider Strategy — Cost Optimization
 *
 * Priority routing:
 *   Ethereum     → Alchemy (paid, reliable) → QuickNode (optional)
 *   BSC          → QuickNode (paid, fast) → Free public RPCs
 *   L2 Chains    → Free public RPCs (primary) → Alchemy (optional, if URL explicitly set)
 *   Avalanche    → Free public RPCs (Alchemy AVAX often unavailable on free tier)
 *
 * Key insight: L2 chains (Arbitrum, Base, Optimism, Polygon) have free public RPCs
 * with generous rate limits. Save Alchemy CUs for Ethereum mainnet where reliability
 * matters most and there are no free alternatives.
 */

// Public RPC endpoints using drpc.org (free tier, supports most EVM chains)
// Register at https://drpc.org to get your free API key
// Format: https://lb.drpc.org/ogrpc?network=<CHAIN>&dkey=<YOUR_KEY>
// The API key is read from env.DRPC_API_KEY
const DRPC_KEY = (() => {
  const key = process.env.DRPC_API_KEY;
  if (!key) {
    console.warn('[RpcManager] DRPC_API_KEY not set — using fallback RPCs without auth');
    return '';
  }
  return key;
})();

function drpcUrl(network: string): { primary: string; fallback: string } {
  const fallbackMap: Record<string, string> = {
    bsc:       'https://bsc-dataseed2.binance.org',
    arbitrum:  'https://arb1.arbitrum.io/rpc',
    polygon:   'https://polygon.llamarpc.com',
    base:      'https://mainnet.base.org',
    optimism:  'https://mainnet.optimism.io',
    avalanche: 'https://avalanche.drpc.org',
    zksync:    'https://mainnet.era.zksync.io',
    linea:     'https://rpc.linea.build',
    scroll:    'https://rpc.scroll.io',
    zkevm:     'https://zkevm-rpc.com',
    mantle:    'https://rpc.mantle.xyz',
    gnosis:    'https://rpc.gnosischain.com',
    metis:     'https://andromeda.metis.io/?owner=1088',
    boba:      'https://mainnet.boba.network',
    blast:     'https://blast.blockpi.network/rpc/v1/public',
    mode:      'https://mainnet.mode.network',
  };
  const fallback = fallbackMap[network] ?? `https://lb.drpc.org/ogrpc?network=${network}&dkey=${DRPC_KEY}`;
  if (!DRPC_KEY) return { primary: fallback, fallback };
  return { primary: `https://lb.drpc.org/ogrpc?network=${network}&dkey=${DRPC_KEY}`, fallback };
}

const PUBLIC_RPCS: Record<string, { primary: string; fallback: string }> = {
  bsc:       drpcUrl('bsc'),
  arbitrum:  drpcUrl('arbitrum'),
  polygon:   drpcUrl('matic'),
  base:      drpcUrl('base'),
  optimism:  drpcUrl('optimism'),
  avalanche: drpcUrl('avalanche'),
  zksync:    drpcUrl('zksync'),
  linea:     drpcUrl('linea'),
  scroll:    drpcUrl('scroll'),
  zkevm:     drpcUrl('polygonzkevm'),
  mantle:    drpcUrl('mantle'),
  gnosis:    drpcUrl('gnosis'),
  metis:     drpcUrl('andromeda'),
  boba:      drpcUrl('boba'),
  blast:     drpcUrl('blast'),
  mode:      drpcUrl('mode'),
};

function buildClients(): Map<SupportedChain, ChainClients> {
  const map = new Map<SupportedChain, ChainClients>();

  // ─── Ethereum ───────────────────────────────────────────────────────────────
  // Always use Alchemy — no free alternative for mainnet reliability
  const ethPrimary = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`, {
      timeout: 10_000,
    }),
  });
  const ethClients: ChainClients = { primary: ethPrimary };
  if (env.QUICKNODE_ETH_URL) {
    ethClients.fallback = createPublicClient({
      chain: mainnet,
      transport: http(env.QUICKNODE_ETH_URL, { timeout: 10_000 }),
    });
  }
  map.set('ethereum', ethClients);

  // ─── BSC ─────────────────────────────────────────────────────────────────────
  // QuickNode if available, otherwise free public RPCs
  if (env.QUICKNODE_BSC_URL) {
    map.set('bsc', {
      primary: createPublicClient({ chain: bsc, transport: http(env.QUICKNODE_BSC_URL, { timeout: 10_000 }) }),
    });
  } else {
    const rpcs = PUBLIC_RPCS.bsc;
    map.set('bsc', {
      primary:  createPublicClient({ chain: bsc, transport: http(rpcs.primary, { timeout: 8_000 }) }),
      fallback: createPublicClient({ chain: bsc, transport: http(rpcs.fallback, { timeout: 8_000 }) }),
    });
  }

  // ─── L2 Chains (Arbitrum, Polygon, Base, Optimism) ─────────────────────────
  // Strategy: Free public RPCs as PRIMARY to save Alchemy CUs.
  // Only use Alchemy if explicitly configured via env var.
  for (const [chainName, viemChain, alchemyEnvKey, rpcConfig] of [
    ['arbitrum', arbitrum, 'ALCHEMY_ARBITRUM_URL' as const, PUBLIC_RPCS.arbitrum],
    ['polygon',  polygon,  'ALCHEMY_POLYGON_URL'  as const, PUBLIC_RPCS.polygon],
    ['base',     base,     'ALCHEMY_BASE_URL'     as const, PUBLIC_RPCS.base],
    ['optimism', optimism, 'ALCHEMY_OPTIMISM_URL'  as const, PUBLIC_RPCS.optimism],
    ['zksync',   zkSync,   'ALCHEMY_ZKSYNC_URL'    as const, PUBLIC_RPCS.zksync],
    ['linea',    linea,    'ALCHEMY_LINEA_URL'     as const, PUBLIC_RPCS.linea],
    ['scroll',   scroll,   'ALCHEMY_SCROLL_URL'   as const, PUBLIC_RPCS.scroll],
  ] as const) {
    const alchemyUrl = env[alchemyEnvKey];
    if (alchemyUrl) {
      // User explicitly set Alchemy URL — use it as primary (costs CUs but more reliable)
      map.set(chainName, {
        primary:  createPublicClient({ chain: viemChain, transport: http(alchemyUrl, { timeout: 10_000 }) }) as unknown as PublicClient,
        fallback: createPublicClient({ chain: viemChain, transport: http(rpcConfig.primary, { timeout: 8_000 }) }) as unknown as PublicClient,
      });
    } else {
      // Free public RPC as primary — NO CUs consumed from Alchemy
      map.set(chainName, {
        primary:  createPublicClient({ chain: viemChain, transport: http(rpcConfig.primary, { timeout: 8_000 }) }) as unknown as PublicClient,
        fallback: createPublicClient({ chain: viemChain, transport: http(rpcConfig.fallback, { timeout: 8_000 }) }) as unknown as PublicClient,
      });
    }
  }

  // ─── Avalanche ─────────────────────────────────────────────────────────────
  // Alchemy AVAX is often not available on free tier. Use free public RPCs.
  const avaxRpcs = PUBLIC_RPCS.avalanche;
  if (env.ALCHEMY_AVALANCHE_URL) {
    map.set('avalanche', {
      primary:  createPublicClient({ chain: avalanche, transport: http(env.ALCHEMY_AVALANCHE_URL, { timeout: 10_000 }) }) as unknown as PublicClient,
      fallback: createPublicClient({ chain: avalanche, transport: http(avaxRpcs.primary, { timeout: 8_000 }) }) as unknown as PublicClient,
    });
  } else {
    map.set('avalanche', {
      primary:  createPublicClient({ chain: avalanche, transport: http(avaxRpcs.primary, { timeout: 8_000 }) }) as unknown as PublicClient,
      fallback: createPublicClient({ chain: avalanche, transport: http(avaxRpcs.fallback, { timeout: 8_000 }) }) as unknown as PublicClient,
    });
  }

  // ─── zkSync Era ────────────────────────────────────────────────────────────
  map.set('zksync', {
    primary:  createPublicClient({ chain: zkSync, transport: http(PUBLIC_RPCS.zksync.primary, { timeout: 12_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: zkSync, transport: http(PUBLIC_RPCS.zksync.fallback, { timeout: 12_000 }) }) as unknown as PublicClient,
  });

  // ─── Linea ────────────────────────────────────────────────────────────────
  map.set('linea', {
    primary:  createPublicClient({ chain: linea, transport: http(PUBLIC_RPCS.linea.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: linea, transport: http(PUBLIC_RPCS.linea.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Scroll ───────────────────────────────────────────────────────────────
  map.set('scroll', {
    primary:  createPublicClient({ chain: scroll, transport: http(PUBLIC_RPCS.scroll.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: scroll, transport: http(PUBLIC_RPCS.scroll.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Polygon zkEVM ───────────────────────────────────────────────────────
  map.set('zkevm', {
    primary:  createPublicClient({ chain: polygonZkEvm, transport: http(PUBLIC_RPCS.zkevm.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: polygonZkEvm, transport: http(PUBLIC_RPCS.zkevm.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Mantle ───────────────────────────────────────────────────────────────
  map.set('mantle', {
    primary:  createPublicClient({ chain: mantle, transport: http(PUBLIC_RPCS.mantle.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: mantle, transport: http(PUBLIC_RPCS.mantle.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Gnosis ───────────────────────────────────────────────────────────────
  map.set('gnosis', {
    primary:  createPublicClient({ chain: gnosis, transport: http(PUBLIC_RPCS.gnosis.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: gnosis, transport: http(PUBLIC_RPCS.gnosis.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Metis ────────────────────────────────────────────────────────────────
  map.set('metis', {
    primary:  createPublicClient({ chain: metis, transport: http(PUBLIC_RPCS.metis.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: metis, transport: http(PUBLIC_RPCS.metis.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Boba ────────────────────────────────────────────────────────────────
  map.set('boba', {
    primary:  createPublicClient({ chain: boba, transport: http(PUBLIC_RPCS.boba.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: boba, transport: http(PUBLIC_RPCS.boba.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Blast ────────────────────────────────────────────────────────────────
  map.set('blast', {
    primary:  createPublicClient({ chain: blast, transport: http(PUBLIC_RPCS.blast.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: blast, transport: http(PUBLIC_RPCS.blast.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  // ─── Mode ────────────────────────────────────────────────────────────────
  map.set('mode', {
    primary:  createPublicClient({ chain: mode, transport: http(PUBLIC_RPCS.mode.primary, { timeout: 10_000 }) }) as unknown as PublicClient,
    fallback: createPublicClient({ chain: mode, transport: http(PUBLIC_RPCS.mode.fallback, { timeout: 10_000 }) }) as unknown as PublicClient,
  });

  return map;
}

export class RpcManager {
  private get clientMap(): Map<SupportedChain, ChainClients> {
    if (!clients) {
      clients = buildClients();
    }
    return clients;
  }

  async call<T>(
    chain: SupportedChain,
    fn: (client: PublicClient) => Promise<T>
  ): Promise<T> {
    const chainClients = this.clientMap.get(chain);
    if (!chainClients) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    try {
      return await fn(chainClients.primary);
    } catch (primaryErr) {
      if (chainClients.fallback) {
        console.warn(`Primary RPC failed for ${chain}, trying fallback:`, primaryErr);
        return await fn(chainClients.fallback);
      }
      throw primaryErr;
    }
  }

  getClient(chain: SupportedChain): PublicClient {
    const chainClients = this.clientMap.get(chain);
    if (!chainClients) throw new Error(`Unsupported chain: ${chain}`);
    return chainClients.primary;
  }

  /**
   * Get latest block number with in-memory caching (5s TTL).
   * Useful for sharing block data across all chains to avoid duplicate eth_blockNumber calls.
   */
  async getCachedBlockNumber(chain: SupportedChain): Promise<bigint> {
    const cached = blockCache.get(chain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.blockNumber;
    }
    const blockNumber = await this.call(chain, (c) => c.getBlockNumber());
    blockCache.set(chain, { blockNumber, timestamp: Date.now() });
    return blockNumber;
  }

  /**
   * Batch fetch multiple blocks using Alchemy's batch RPC API.
   * Single HTTP round-trip regardless of block count — minimal CU overhead.
   * Falls back to sequential calls if batch fails.
   *
   * Returns a Map of blockNumber -> BlockData (omits failed ones silently).
   */
  async getBlocksBatch(
    chain: SupportedChain,
    blockNumbers: bigint[]
  ): Promise<Map<bigint, BlockData>> {
    if (blockNumbers.length === 0) return new Map();

    // Deduplicate and sort
    const uniqueBlocks = [...new Set(blockNumbers)].sort((a, b) => Number(a) - Number(b));

    // Single block — use viem directly
    if (uniqueBlocks.length === 1) {
      const block = await this.call(chain, (c) =>
        c.getBlock({ blockNumber: uniqueBlocks[0], includeTransactions: false })
      );
      const txs = (block.transactions as unknown as Array<Record<string, unknown>>) ?? [];
      return new Map([[uniqueBlocks[0], {
        number: block.number ?? uniqueBlocks[0],
        timestamp: block.timestamp ?? 0n,
        transactions: txs.map((tx) => ({
          hash: (tx.hash ?? '0x') as `0x${string}`,
          from: (tx.from ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
          to: (tx.to ?? null) as `0x${string}` | null,
          value: BigInt((tx.value ?? '0') as string),
        })),
      }]]);
    }

    // Batch RPC: all blocks in one HTTP request
    const results = await this.batchRpc(
      chain,
      uniqueBlocks.map((bn) => ({
        method: 'eth_getBlockByNumber',
        params: ['0x' + bn.toString(16), false],
      }))
    );

    const map = new Map<bigint, BlockData>();
    results.forEach((result, i) => {
      if (result && typeof result === 'object') {
        const blockData = result as Record<string, unknown>;
        const txs = (blockData.transactions ?? []) as Array<Record<string, unknown>>;
        map.set(uniqueBlocks[i], {
          number: blockData.number ? BigInt(blockData.number as string) : uniqueBlocks[i],
          timestamp: blockData.timestamp ? BigInt(blockData.timestamp as string) : 0n,
          transactions: txs.map((tx) => ({
            hash: (tx.hash ?? '0x') as `0x${string}`,
            from: (tx.from ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            to: (tx.to ?? null) as `0x${string}` | null,
            value: BigInt((tx.value ?? '0') as string),
          })),
        });
      }
    });

    return map;
  }

  /**
   * Batch RPC call using Alchemy's enhanced batch API.
   * Single HTTP request containing multiple JSON-RPC calls.
   * This is much more CU-efficient than individual requests.
   *
   * Alchemy batch: POST with body [{jsonrpc, id, method, params}, ...]
   * All calls share one HTTP round-trip regardless of count.
   */
  async batchRpc(
    chain: SupportedChain,
    calls: Array<{ method: string; params?: unknown[] }>
  ): Promise<unknown[]> {
    const client = this.getClient(chain);
    const transport = (client as any).transport;

    // Use Alchemy's batch endpoint if available (requires Alchemy URL)
    const rpcUrl = transport?.url as string | undefined;
    if (!rpcUrl) return this.fallbackBatchRpc(chain, calls);

    try {
      const responses = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          calls.map((call, i) => ({
            jsonrpc: '2.0',
            id: i + 1,
            method: call.method,
            params: call.params ?? [],
          }))
        ),
        signal: AbortSignal.timeout(15_000),
      });

      if (responses.ok) {
        const results = await responses.json() as Array<{ result?: unknown; error?: { message: string } }>;
        return results.map((r) => {
          if (r.error) throw new Error(r.error.message);
          return r.result;
        });
      }
    } catch {
      // Fall back to sequential
    }

    return this.fallbackBatchRpc(chain, calls);
  }

  /** Sequential fallback for batch RPC — uses the correct chain */
  private async fallbackBatchRpc(
    chain: SupportedChain,
    calls: Array<{ method: string; params?: unknown[] }>
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const call of calls) {
      try {
        const result = await this.call(chain, (c) =>
          (c as any).request({ method: call.method, params: call.params ?? [] })
        );
        results.push(result);
      } catch {
        results.push(null);
      }
    }
    return results;
  }

  /**
   * Returns the RPC provider name for observability/cost tracking.
   */
  getProviderName(chain: SupportedChain): string {
    const chainClients = this.clientMap.get(chain);
    if (!chainClients) return 'unknown';
    const url = (chainClients.primary as any).transport?.url as string | undefined;
    if (!url) return 'unknown';
    if (url.includes('alchemy')) return 'Alchemy';
    if (url.includes('quicknode')) return 'QuickNode';
    if (url.includes('llamarpc')) return 'LlamaRPC';
    if (url.includes('binance') || url.includes('bsc')) return 'Binance';
    if (url.includes('avax') || url.includes('drpc')) return 'Avalanche';
    if (url.includes('zksync') || url.includes('era.zksync')) return 'zkSync';
    if (url.includes('linea') || url.includes('linea.build')) return 'Linea';
    if (url.includes('scroll') || url.includes('mode.network')) return 'Scroll/Mode';
    if (url.includes('mantle')) return 'Mantle';
    if (url.includes('gnosis')) return 'Gnosis';
    if (url.includes('metis')) return 'Metis';
    if (url.includes('boba')) return 'Boba';
    if (url.includes('blast')) return 'Blast';
    return 'public';
  }
}

export const rpcManager = new RpcManager();
