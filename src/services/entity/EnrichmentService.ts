/**
 * EnrichmentService — automatically labels unknown addresses by querying:
 *   1. Alchemy alchemy_getTokenMetadata  (ERC-20 tokens)
 *   2. On-chain name() / symbol() call via viem  (most DeFi contracts)
 *   3. Sourcify contract metadata  (verified contracts, no API key needed)
 *   4. Etherscan getsourcecode  (optional, when ETHERSCAN_API_KEY is set + accessible)
 *
 * Flow:
 *   WhaleMonitor sees unknown from/to address
 *     → enqueue(address, chain)              ← non-blocking, deduplicated
 *     → drain loop (every 600ms, max 4/tick) ← rate-limited
 *     → enrichOne(): try sources in order    ← first hit wins
 *     → INSERT INTO entities ON CONFLICT DO NOTHING
 *     → next lookup hits DB cache
 */

import axios from 'axios';
import { createPublicClient, http, parseAbi } from 'viem';
import * as viemChains from 'viem/chains';
import { db } from '../db/Database.js';
import { env } from '../../config/index.js';
import type { SupportedChain } from '../../types/chain.types.js';

// ---------------------------------------------------------------------------
// Chain configs
// ---------------------------------------------------------------------------
const CHAIN_VIEM: Record<string, ReturnType<typeof createPublicClient>> = {};

function getClient(chain: SupportedChain): ReturnType<typeof createPublicClient> | null {
  if (CHAIN_VIEM[chain]) return CHAIN_VIEM[chain];
  const RPC_URLS: Partial<Record<SupportedChain, string>> = {
    ethereum:  `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    arbitrum:  env.ALCHEMY_ARBITRUM_URL ?? `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    polygon:   env.ALCHEMY_POLYGON_URL  ?? `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    base:      env.ALCHEMY_BASE_URL     ?? `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    optimism:  env.ALCHEMY_OPTIMISM_URL ?? `https://opt-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    avalanche: `https://avax-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    bsc:       'https://bsc-dataseed.binance.org',
  };
  const rpcUrl = RPC_URLS[chain];
  if (!rpcUrl) return null;

  const chainMap: Record<string, unknown> = {
    ethereum:  viemChains.mainnet,
    arbitrum:  viemChains.arbitrum,
    polygon:   viemChains.polygon,
    base:      viemChains.base,
    optimism:  viemChains.optimism,
    avalanche: viemChains.avalanche,
    bsc:       viemChains.bsc,
  };
  const viemChain = chainMap[chain];
  if (!viemChain) return null;

  const client = createPublicClient({
    chain: viemChain as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(rpcUrl),
  });
  CHAIN_VIEM[chain] = client;
  return client;
}

// Sourcify chain IDs
const SOURCIFY_CHAIN_ID: Partial<Record<SupportedChain, number>> = {
  ethereum:  1,
  arbitrum:  42161,
  polygon:   137,
  base:      8453,
  optimism:  10,
  avalanche: 43114,
  bsc:       56,
};

// Etherscan-compatible API URLs per chain
const EXPLORER_API: Partial<Record<SupportedChain, string>> = {
  ethereum:  'https://api.etherscan.io/api',
  bsc:       'https://api.bscscan.com/api',
  arbitrum:  'https://api.arbiscan.io/api',
  polygon:   'https://api.polygonscan.com/api',
  base:      'https://api.basescan.org/api',
  optimism:  'https://api-optimistic.etherscan.io/api',
  avalanche: 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api',
};

// ---------------------------------------------------------------------------
// Keyword → entity_type heuristic
// ---------------------------------------------------------------------------
const TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/tornado|mixer|blender|cyclone/i,                            'mixer'],
  [/bridge|gateway|relay|portal|wormhole|stargate|hop\b/i,      'bridge'],
  [/lido|rocketpool|staked?|staking|beacon/i,                   'protocol'],
  [/uniswap|sushiswap|pancake|curve|balancer|1inch|dex|swap/i,  'protocol'],
  [/aave|compound|maker|euler|morpho|radiant|lending/i,         'protocol'],
  [/eigen|pendle|gmx|perp|perpetual|synthetix|dydx/i,           'protocol'],
  [/usdc|usdt|dai|busd|tusd|frax|lusd|tether|circle|stablecoin/i,'stablecoin'],
  [/chainlink|band\s*protocol|oracle/i,                         'oracle'],
  [/dao|treasury|governance/i,                                  'dao'],
  [/nft|erc721|erc1155|opensea|blur|seaport/i,                  'nft'],
  [/binance|coinbase|okx|kraken|bybit|kucoin|gate\.|bitfinex|htx|huobi|mexc/i, 'exchange'],
];

function guessEntityType(name: string): string {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(name)) return type;
  }
  return 'protocol';
}

// ---------------------------------------------------------------------------
// Name ABI fragments
// ---------------------------------------------------------------------------
const NAME_ABI = parseAbi(['function name() view returns (string)']);
const SYMBOL_ABI = parseAbi(['function symbol() view returns (string)']);

// ---------------------------------------------------------------------------
// EnrichmentService
// ---------------------------------------------------------------------------
class EnrichmentService {
  private readonly pending = new Set<string>();
  private readonly done    = new Set<string>();

  private drainTimer: NodeJS.Timeout | null = null;
  private etherscanReachable: boolean | null = null; // null = untested

  start(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => this.drain(), 600);
    this.drainTimer.unref?.();
  }

  stop(): void {
    if (this.drainTimer) { clearInterval(this.drainTimer); this.drainTimer = null; }
  }

  enqueue(address: string, chain: SupportedChain): void {
    const key = `${address.toLowerCase()}:${chain}`;
    if (this.done.has(key) || this.pending.has(key)) return;
    this.pending.add(key);
  }

  async enrichNow(address: string, chain: SupportedChain): Promise<{
    saved: boolean; contractName?: string; entity_type?: string;
  }> {
    return this.enrichOne(address.toLowerCase(), chain);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async drain(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = [...this.pending].slice(0, 4);
    batch.forEach((k) => this.pending.delete(k));
    await Promise.allSettled(
      batch.map(async (key) => {
        const [address, chain] = key.split(':') as [string, SupportedChain];
        await this.enrichOne(address, chain);
        this.done.add(key);
      })
    );
  }

  private async enrichOne(
    address: string, chain: SupportedChain
  ): Promise<{ saved: boolean; contractName?: string; entity_type?: string }> {
    try {
      // Skip if already in DB
      const existing = await db.queryOne<{ id: number }>(
        `SELECT id FROM entities WHERE address = $1 AND (chain = $2 OR chain = 'multi') LIMIT 1`,
        [address, chain]
      );
      if (existing) return { saved: false };

      // Try each source in order — first hit wins
      const result =
        await this.tryAlchemyTokenMetadata(address, chain) ??
        await this.tryOnChainName(address, chain) ??
        await this.trySourcify(address, chain) ??
        await this.tryEtherscan(address, chain);

      if (!result) return { saved: false };

      await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ($1, $2, $3, $4, $5, 'medium', $6, '{}')
         ON CONFLICT (address, chain) DO NOTHING`,
        [address, chain, result.name, result.name, result.entity_type, result.source]
      );

      console.log(`[Enrichment] ✅ ${chain} ${address.slice(0, 10)}… → ${result.name} (${result.entity_type}) via ${result.source}`);
      return { saved: true, contractName: result.name, entity_type: result.entity_type };

    } catch {
      return { saved: false };
    }
  }

  /** Source 1: Alchemy alchemy_getTokenMetadata (ERC-20 tokens) */
  private async tryAlchemyTokenMetadata(
    address: string, chain: SupportedChain
  ): Promise<{ name: string; entity_type: string; source: string } | null> {
    const RPC_URLS: Partial<Record<SupportedChain, string>> = {
      ethereum:  `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      arbitrum:  env.ALCHEMY_ARBITRUM_URL ?? `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      polygon:   env.ALCHEMY_POLYGON_URL  ?? `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      base:      env.ALCHEMY_BASE_URL     ?? `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      optimism:  env.ALCHEMY_OPTIMISM_URL ?? `https://opt-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    };
    const rpcUrl = RPC_URLS[chain];
    if (!rpcUrl) return null;

    try {
      const resp = await axios.post(rpcUrl, {
        jsonrpc: '2.0', id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [address],
      }, { timeout: 5_000 });

      const result = resp.data?.result;
      if (!result?.name) return null;

      const name = result.name as string;
      const symbol = (result.symbol as string) ?? '';
      const label = symbol ? `${name} (${symbol})` : name;
      const entity_type = guessEntityType(label);

      return { name: label, entity_type, source: 'alchemy' };
    } catch {
      return null;
    }
  }

  /** Source 2: On-chain name() + symbol() call via viem */
  private async tryOnChainName(
    address: string, chain: SupportedChain
  ): Promise<{ name: string; entity_type: string; source: string } | null> {
    const client = getClient(chain);
    if (!client) return null;

    try {
      const addr = address as `0x${string}`;

      // First check it has code (is a contract)
      const code = await client.getBytecode({ address: addr });
      if (!code || code === '0x') return null; // EOA

      // Try name()
      let contractName = '';
      try {
        contractName = await client.readContract({
          address: addr, abi: NAME_ABI, functionName: 'name',
        }) as string;
      } catch {
        // not ERC20-style, try symbol
        try {
          contractName = await client.readContract({
            address: addr, abi: SYMBOL_ABI, functionName: 'symbol',
          }) as string;
        } catch {
          return null;
        }
      }

      if (!contractName || contractName.length > 100) return null;

      const entity_type = guessEntityType(contractName);
      return { name: contractName, entity_type, source: 'onchain' };
    } catch {
      return null;
    }
  }

  /** Source 3: Sourcify (decentralized verification, no API key needed) */
  private async trySourcify(
    address: string, chain: SupportedChain
  ): Promise<{ name: string; entity_type: string; source: string } | null> {
    const chainId = SOURCIFY_CHAIN_ID[chain];
    if (!chainId) return null;

    try {
      const resp = await axios.get(
        `https://sourcify.dev/server/files/any/${chainId}/${address}`,
        { timeout: 6_000 }
      );
      // Response is an array of files; find metadata.json
      const files = resp.data?.files as Array<{ name: string; content: string }> | undefined;
      if (!files) return null;

      const metaFile = files.find((f) => f.name.includes('metadata.json'));
      if (!metaFile) return null;

      const meta = JSON.parse(metaFile.content);
      // The contract name is the last key in settings.compilationTarget
      const target = meta?.settings?.compilationTarget as Record<string, string> | undefined;
      if (!target) return null;

      const contractName = Object.values(target)[0];
      if (!contractName) return null;

      const entity_type = guessEntityType(contractName);
      return { name: contractName, entity_type, source: 'sourcify' };
    } catch {
      return null;
    }
  }

  /** Source 4: Etherscan getsourcecode (optional, requires key + network access) */
  private async tryEtherscan(
    address: string, chain: SupportedChain
  ): Promise<{ name: string; entity_type: string; source: string } | null> {
    if (!env.ETHERSCAN_API_KEY) return null;

    // Skip if we've already determined Etherscan is unreachable this session
    if (this.etherscanReachable === false) return null;

    const apiUrl = EXPLORER_API[chain];
    if (!apiUrl) return null;

    try {
      const resp = await axios.get(apiUrl, {
        params: { module: 'contract', action: 'getsourcecode', address, apikey: env.ETHERSCAN_API_KEY },
        timeout: 8_000,
      });
      if (this.etherscanReachable === null) this.etherscanReachable = true;

      const data = resp.data;
      if (!data || data.status !== '1' || !Array.isArray(data.result) || !data.result[0]) return null;

      const contractName = (data.result[0].ContractName as string ?? '').trim();
      if (!contractName) return null;

      const entity_type = guessEntityType(contractName);
      return { name: contractName, entity_type, source: 'etherscan' };
    } catch {
      if (this.etherscanReachable === null) {
        this.etherscanReachable = false;
        console.log('[Enrichment] Etherscan unreachable — using on-chain sources only');
      }
      return null;
    }
  }
}

export const enrichmentService = new EnrichmentService();
