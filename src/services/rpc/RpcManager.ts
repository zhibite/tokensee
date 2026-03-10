import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, bsc, arbitrum, polygon, base, optimism, avalanche } from 'viem/chains';
import { env } from '../../config/index.js';
import type { SupportedChain } from '../../types/chain.types.js';

interface ChainClients {
  primary: PublicClient;
  fallback?: PublicClient;
}

let clients: Map<SupportedChain, ChainClients> | null = null;

function buildClients(): Map<SupportedChain, ChainClients> {
  const map = new Map<SupportedChain, ChainClients>();

  // Ethereum
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

  // BSC — QuickNode primary (Alchemy doesn't support BSC)
  if (env.QUICKNODE_BSC_URL) {
    const bscPrimary = createPublicClient({
      chain: bsc,
      transport: http(env.QUICKNODE_BSC_URL, { timeout: 10_000 }),
    });
    map.set('bsc', { primary: bscPrimary });
  } else {
    // Public BSC RPC fallback for development — rotate through multiple endpoints
    const bscPrimary = createPublicClient({
      chain: bsc,
      transport: http('https://binance.llamarpc.com', { timeout: 8_000 }),
    });
    const bscFallback = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed2.binance.org', { timeout: 8_000 }),
    });
    map.set('bsc', { primary: bscPrimary, fallback: bscFallback });
  }

  // Arbitrum — Alchemy primary, reliable public fallback
  {
    const url = env.ALCHEMY_ARBITRUM_URL ?? `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    map.set('arbitrum', {
      primary:  createPublicClient({ chain: arbitrum, transport: http(url, { timeout: 10_000 }) }),
      fallback: createPublicClient({ chain: arbitrum, transport: http('https://arbitrum.llamarpc.com', { timeout: 8_000 }) }),
    });
  }

  // Polygon — Alchemy primary, reliable public fallback
  {
    const url = env.ALCHEMY_POLYGON_URL ?? `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    map.set('polygon', {
      primary:  createPublicClient({ chain: polygon, transport: http(url, { timeout: 10_000 }) }),
      fallback: createPublicClient({ chain: polygon, transport: http('https://polygon.llamarpc.com', { timeout: 8_000 }) }),
    });
  }

  // Base — Alchemy primary, public fallback (OP Stack chain, cast required)
  {
    const url = env.ALCHEMY_BASE_URL ?? `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    map.set('base', {
      primary:  createPublicClient({ chain: base, transport: http(url, { timeout: 10_000 }) }) as unknown as PublicClient,
      fallback: createPublicClient({ chain: base, transport: http('https://base.llamarpc.com', { timeout: 8_000 }) }) as unknown as PublicClient,
    });
  }

  // Optimism — Alchemy primary, public fallback (OP Stack chain, cast required)
  {
    const url = env.ALCHEMY_OPTIMISM_URL ?? `https://opt-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    map.set('optimism', {
      primary:  createPublicClient({ chain: optimism, transport: http(url, { timeout: 10_000 }) }) as unknown as PublicClient,
      fallback: createPublicClient({ chain: optimism, transport: http('https://optimism.llamarpc.com', { timeout: 8_000 }) }) as unknown as PublicClient,
    });
  }

  // Avalanche C-Chain — use explicit Alchemy URL if configured, else public RPCs directly
  // (shared Alchemy API key may not have AVAX enabled on free tier)
  {
    const avaxPublic = 'https://api.avax.network/ext/bc/C/rpc';
    const avaxBackup = 'https://avalanche.drpc.org';
    const avaxPrimary = env.ALCHEMY_AVALANCHE_URL
      ? createPublicClient({ chain: avalanche, transport: http(env.ALCHEMY_AVALANCHE_URL, { timeout: 10_000 }) })
      : createPublicClient({ chain: avalanche, transport: http(avaxPublic, { timeout: 10_000 }) });
    const avaxFallback = createPublicClient({
      chain: avalanche,
      transport: http(env.ALCHEMY_AVALANCHE_URL ? avaxPublic : avaxBackup, { timeout: 8_000 }),
    });
    map.set('avalanche', {
      primary:  avaxPrimary  as unknown as PublicClient,
      fallback: avaxFallback as unknown as PublicClient,
    });
  }

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
}

export const rpcManager = new RpcManager();
