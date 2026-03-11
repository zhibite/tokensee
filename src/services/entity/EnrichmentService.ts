/**
 * EnrichmentService — automatically labels unknown addresses by querying
 * block-explorer APIs (Etherscan-compatible) for contract source metadata.
 *
 * Flow:
 *   WhaleMonitor sees unknown from/to address
 *     → enqueue(address, chain)              ← non-blocking, deduplicated
 *     → drain loop (every 600ms, max 5/tick) ← rate-limited
 *     → enrichOne(): call explorer API       ← getsourcecode or getabi
 *     → INSERT INTO entities ON CONFLICT DO NOTHING
 *     → next lookup hits DB cache
 *
 * No Etherscan key required — free tier without key works at 1–2 req/s.
 * Set ETHERSCAN_API_KEY in .env to raise limit to 5 req/s.
 */

import axios from 'axios';
import { db } from '../db/Database.js';
import { env } from '../../config/index.js';
import type { SupportedChain } from '../../types/chain.types.js';

// ---------------------------------------------------------------------------
// Block-explorer API config per chain
// ---------------------------------------------------------------------------
interface ExplorerConfig {
  apiUrl: string;
  keyParam: string; // query-param name for the API key
}

const EXPLORER: Partial<Record<SupportedChain, ExplorerConfig>> = {
  ethereum:  { apiUrl: 'https://api.etherscan.io/api',            keyParam: 'apikey' },
  bsc:       { apiUrl: 'https://api.bscscan.com/api',              keyParam: 'apikey' },
  arbitrum:  { apiUrl: 'https://api.arbiscan.io/api',              keyParam: 'apikey' },
  polygon:   { apiUrl: 'https://api.polygonscan.com/api',          keyParam: 'apikey' },
  base:      { apiUrl: 'https://api.basescan.org/api',             keyParam: 'apikey' },
  optimism:  { apiUrl: 'https://api-optimistic.etherscan.io/api',  keyParam: 'apikey' },
  avalanche: { apiUrl: 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api', keyParam: 'apikey' },
};

// ---------------------------------------------------------------------------
// Keyword → entity_type heuristic map
// ---------------------------------------------------------------------------
const TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/tornado|mixer|blender|cyclone/i,                          'mixer'],
  [/bridge|gateway|relay|portal|wormhole|stargate|hop\b/i,    'bridge'],
  [/\b(gnosis\s*safe|multisig|safe\s*proxy)\b/i,              'other'],
  [/lido|rocketpool|staked|staking|beacon/i,                  'protocol'],
  [/uniswap|sushiswap|pancake|curve|balancer|1inch|dex|swap/i,'protocol'],
  [/aave|compound|maker|euler|morpho|radiant|lending/i,       'protocol'],
  [/eigen|pendle|gmx|perp|perpetual|synthetix|dydx/i,         'protocol'],
  [/usdc|usdt|dai|busd|tusd|frax|lusd|stablecoin|tether|circle/i,'stablecoin'],
  [/chainlink|band\s*protocol|oracle/i,                       'oracle'],
  [/dao|treasury|governance/i,                                'dao'],
  [/nft|erc721|erc1155|opensea|blur|seaport/i,                'nft'],
  [/binance|coinbase|okx|kraken|bybit|kucoin|gate\.|bitfinex|htx|huobi|mexc|bitget/i, 'exchange'],
  [/deployer|proxy|factory|implementation|admin|timelock/i,   'protocol'],
  [/router|dispatcher|executor|aggregator/i,                  'protocol'],
];

function guessEntityType(contractName: string): string {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(contractName)) return type;
  }
  return 'protocol'; // most unknown contracts are DeFi-related
}

// ---------------------------------------------------------------------------
// EnrichmentService
// ---------------------------------------------------------------------------
class EnrichmentService {
  /** Pending queue: "address:chain" → prevents duplicate work */
  private readonly pending = new Set<string>();
  /** Already-processed this session (avoid redundant re-queries) */
  private readonly done = new Set<string>();

  private drainTimer: NodeJS.Timeout | null = null;
  private readonly DRAIN_INTERVAL_MS = 600;
  private readonly BATCH_SIZE = 4; // requests per drain tick

  start(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => this.drain(), this.DRAIN_INTERVAL_MS);
    // Don't keep process alive for this alone
    this.drainTimer.unref?.();
  }

  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  /**
   * Enqueue an address for enrichment (non-blocking, idempotent).
   * Only queues if we don't already have entity data cached.
   */
  enqueue(address: string, chain: SupportedChain): void {
    if (!EXPLORER[chain]) return;
    const key = `${address.toLowerCase()}:${chain}`;
    if (this.done.has(key) || this.pending.has(key)) return;
    this.pending.add(key);
  }

  /**
   * Synchronously enrich one address — useful for the manual API endpoint.
   * Returns true if a new entity was saved.
   */
  async enrichNow(address: string, chain: SupportedChain): Promise<{
    saved: boolean;
    contractName?: string;
    entity_type?: string;
  }> {
    return this.enrichOne(address.toLowerCase(), chain);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async drain(): Promise<void> {
    if (this.pending.size === 0) return;

    const batch = [...this.pending].slice(0, this.BATCH_SIZE);
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
    address: string,
    chain: SupportedChain
  ): Promise<{ saved: boolean; contractName?: string; entity_type?: string }> {
    const cfg = EXPLORER[chain];
    if (!cfg) return { saved: false };

    try {
      // 1. Check if it's already in DB to avoid redundant API calls
      const existing = await db.queryOne<{ id: number }>(
        `SELECT id FROM entities WHERE address = $1 AND (chain = $2 OR chain = 'multi') LIMIT 1`,
        [address, chain]
      );
      if (existing) return { saved: false };

      // 2. Query block explorer
      const params: Record<string, string> = {
        module:  'contract',
        action:  'getsourcecode',
        address,
      };
      const apiKey = env.ETHERSCAN_API_KEY;
      if (apiKey) params[cfg.keyParam] = apiKey;

      const resp = await axios.get(cfg.apiUrl, {
        params,
        timeout: 8_000,
        headers: { 'User-Agent': 'TokenSee/1.0 (+https://tokensee.com)' },
      });

      const data = resp.data;
      if (!data || data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) {
        return { saved: false }; // EOA or not verified
      }

      const info = data.result[0] as Record<string, string>;
      const contractName = (info.ContractName ?? '').trim();
      if (!contractName) return { saved: false }; // unverified contract

      // 3. Derive entity metadata
      const entity_type = guessEntityType(contractName);
      const label       = contractName;
      const entity_name = contractName;

      // 4. Persist
      await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ($1, $2, $3, $4, $5, 'medium', 'etherscan', '{}')
         ON CONFLICT (address, chain) DO NOTHING`,
        [address, chain, label, entity_name, entity_type]
      );

      console.log(`[Enrichment] ✅ ${chain} ${address.slice(0, 10)}… → ${label} (${entity_type})`);
      return { saved: true, contractName, entity_type };

    } catch (err) {
      // Rate-limited or network error — silently skip, will retry on next enqueue
      const msg = (err as Error).message ?? '';
      if (!msg.includes('429') && !msg.includes('timeout')) {
        // Only log unexpected errors
      }
      return { saved: false };
    }
  }
}

export const enrichmentService = new EnrichmentService();
