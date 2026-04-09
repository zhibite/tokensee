/**
 * WhaleMonitor — polls latest blocks on each chain, detects large transfers,
 * enriches with entity labels, and persists to whale_alerts table.
 *
 * Runs as a background interval in src/index.ts.
 * Polling interval: 30s ETH (12s block), 15s BSC (3s block)
 *
 * Optimizations applied:
 * 1. Block number caching (5s TTL) — shared across chains to avoid duplicate eth_blockNumber calls
 * 2. Alchemy batch RPC — multiple requests in a single HTTP round-trip to reduce CU consumption
 * 3. Per-chain RPC provider routing — free public RPCs for L2/BSC, paid Alchemy for ETH
 */

import { EventEmitter } from 'events';
import { formatUnits, type Log, type PublicClient } from 'viem';
import { rpcManager, type BlockData } from '../rpc/RpcManager.js';
import { entityService } from '../entity/EntityService.js';
import { enrichmentService } from '../entity/EnrichmentService.js';
import { clusteringService } from '../entity/ClusteringService.js';
import { priceService } from '../price/PriceService.js';
import { webhookService } from '../webhook/WebhookService.js';
import { alertRulesService } from '../alertrules/AlertRulesService.js';
import { db } from '../db/Database.js';

/** Emits 'alert' events with a WhaleAlert payload — consumed by SSE endpoint */
export const whaleAlertEmitter = new EventEmitter();
whaleAlertEmitter.setMaxListeners(200);
import {
  ERC20_TRANSFER_TOPIC,
  NATIVE_TOKEN_ADDRESS,
  WETH_ADDRESS_ETH,
  WBNB_ADDRESS_BSC,
  WETH_ADDRESS_ARB,
  WMATIC_ADDRESS_POLYGON,
  WETH_ADDRESS_BASE,
  WETH_ADDRESS_OP,
  WAVAX_ADDRESS,
} from '../../config/chains.config.js';
import type { SupportedChain } from '../../types/chain.types.js';

// Additional ERC20 token addresses for new chains
// Maintained here to avoid importing from viem in the monitor
const TOKEN_ADDRESSES = {
  // zkSync Era
  zksync: {
    '0x5aea5775959fbc2557cc8789bc1bf90a239dbe91': { symbol: 'USDC', decimals: 6 }, // zkSync native USDC
    '0x3355df6d4c9c3035724bd0e1bfa9e4e1a01e42f2': { symbol: 'USDC', decimals: 6 }, // nUSDC
  },
  // Linea
  linea: {
    '0x176211869ca2b568f2a7d4ee941e073a821ee1ff': { symbol: 'USDC', decimals: 6 },
    '0x913d8adb7d0f9fc4e9c98e07c70a8d1e8d99d1f4': { symbol: 'USDT', decimals: 6 },
  },
  // Scroll
  scroll: {
    '0x06efdbff2a14a7c8e15944d1f4a48f9f95f9a4ec': { symbol: 'USDC', decimals: 6 },
    '0xf55bec9ca59ded9bfba390a5c5ad3cb7b232c0f1': { symbol: 'USDT', decimals: 6 },
  },
  // Polygon zkEVM
  zkevm: {
    '0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035': { symbol: 'USDC', decimals: 6 },
    '0x1e4a5968a5ce7bcb7cb5d6e3d1c5a0b8e4f5c6a7': { symbol: 'USDT', decimals: 6 },
  },
  // Mantle
  mantle: {
    '0x09bc4e0d864854c6afb6eb9a1add8900508d8b00': { symbol: 'USDC', decimals: 6 },
    '0x201eba5cc46d216c6d3c81e262c4d4f3b540a89a': { symbol: 'USDT', decimals: 6 },
    '0x5db67696a3d5fd4e5b2e4e8f1d4c7b3a5e6f9d8c': { symbol: 'WMNT', decimals: 18 },
  },
  // Gnosis
  gnosis: {
    '0xddafbb505ad214d7b80b1f1bfc074b78c4f4f94a': { symbol: 'USDC', decimals: 6 },
    '0x4ecaba5870353805a9f068101a40e0f32ed605c6': { symbol: 'USDT', decimals: 6 },
    '0xe91d153e0b41518a2ce8dd3d7944fa86347a4653': { symbol: 'xDAI', decimals: 18 },
  },
  // Metis
  metis: {
    '0x42000df2fb3756d8e01c9b1c4c5a3d4f6e7a8b9c': { symbol: 'mUSDC', decimals: 6 },
    '0x4300000000000000000000000000000000000004': { symbol: 'USDT', decimals: 6 },
  },
  // Boba
  boba: {
    '0x461d52769884ca6235b6854942040b2a37583ea2': { symbol: 'USDC', decimals: 6 },
    '0x1de6932a5e6b3cb4e9a8e2e5a3c1d7f0b8e7d9c0': { symbol: 'USDT', decimals: 6 },
  },
  // Blast
  blast: {
    '0x4300000000000000000000000000000000000001': { symbol: 'USDB', decimals: 18 }, // Blast USDB (native stablecoin)
    '0x8d11ec38a3eb5e956b420f7d121fe648de512efe': { symbol: 'USDT', decimals: 6 },
  },
  // Mode
  mode: {
    '0x985505b79f8d31c7e7b664a6b5fc55a7c7f3d8e9': { symbol: 'USDC', decimals: 6 },
    '0x4a4f8b6c2e9a7c3d1f0e8d5a7b6c9e0f1d2a3b4': { symbol: 'USDT', decimals: 6 },
  },
};

// USD threshold to qualify as a "whale" alert — configurable via WHALE_USD_THRESHOLD env
const USD_THRESHOLD = parseInt(process.env.WHALE_USD_THRESHOLD ?? '1000000', 10);

// Tokens to track (address → { symbol, decimals })
const TRACKED_TOKENS: Record<string, Record<string, { symbol: string; decimals: number }>> = {
  ethereum: {
    [WETH_ADDRESS_ETH]:                                  { symbol: 'WETH',  decimals: 18 },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':        { symbol: 'USDC',  decimals: 6  },
    '0xdac17f958d2ee523a2206206994597c13d831ec7':        { symbol: 'USDT',  decimals: 6  },
    '0x6b175474e89094c44da98b954eedeac495271d0f':        { symbol: 'DAI',   decimals: 18 },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599':        { symbol: 'WBTC',  decimals: 8  },
    '0x514910771af9ca656af840dff83e8264ecf986ca':        { symbol: 'LINK',  decimals: 18 },
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984':        { symbol: 'UNI',   decimals: 18 },
  },
  bsc: {
    [WBNB_ADDRESS_BSC]:                                  { symbol: 'WBNB',  decimals: 18 },
    '0x55d398326f99059ff775485246999027b3197955':        { symbol: 'USDT',  decimals: 18 },
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d':        { symbol: 'USDC',  decimals: 18 },
    '0xe9e7cea3dedca5984780bafc599bd69add087d56':        { symbol: 'BUSD',  decimals: 18 },
  },
  arbitrum: {
    [WETH_ADDRESS_ARB]:                                  { symbol: 'WETH',  decimals: 18 },
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831':        { symbol: 'USDC',  decimals: 6  },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9':        { symbol: 'USDT',  decimals: 6  },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1':        { symbol: 'DAI',   decimals: 18 },
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f':        { symbol: 'WBTC',  decimals: 8  },
  },
  polygon: {
    [WMATIC_ADDRESS_POLYGON]:                            { symbol: 'WMATIC', decimals: 18 },
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359':        { symbol: 'USDC',  decimals: 6  },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f':        { symbol: 'USDT',  decimals: 6  },
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063':        { symbol: 'DAI',   decimals: 18 },
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619':        { symbol: 'WETH',  decimals: 18 },
  },
  base: {
    [WETH_ADDRESS_BASE]:                                 { symbol: 'WETH',  decimals: 18 },
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913':        { symbol: 'USDC',  decimals: 6  },
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb':        { symbol: 'DAI',   decimals: 18 },
  },
  optimism: {
    [WETH_ADDRESS_OP]:                                   { symbol: 'WETH',  decimals: 18 },
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85':        { symbol: 'USDC',  decimals: 6  },
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58':        { symbol: 'USDT',  decimals: 6  },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1':        { symbol: 'DAI',   decimals: 18 },
  },
  avalanche: {
    [WAVAX_ADDRESS]:                                     { symbol: 'WAVAX', decimals: 18 },
    '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e':        { symbol: 'USDC',  decimals: 6  },
    '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7':        { symbol: 'USDT',  decimals: 6  },
    '0xd586e7f844cea2f87f50152665bcbc2c279d8d70':        { symbol: 'DAI',   decimals: 18 },
  },
  // ── zkSync Era ────────────────────────────────────────────────────────────
  zksync: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 }, // native ETH
    '0x5aea5775959fbc2557cc8789bc1bf90a239dbe91':        { symbol: 'USDC',  decimals: 6  }, // zkSync USDC
    '0x3355df6d4c9c3035724bd0e1bfa9e4e1a01e42f2':        { symbol: 'USDC',  decimals: 6  }, // nUSDC
  },
  // ── Linea ─────────────────────────────────────────────────────────────────
  linea: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0x176211869ca2b568f2a7d4ee941e073a821ee1ff':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0x06efdbff2a14a7c8e15944d1f4a48f9f95f9a4ec':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Polygon zkEVM ──────────────────────────────────────────────────────────
  zkevm: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Mantle ─────────────────────────────────────────────────────────────────
  mantle: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'MNT',   decimals: 18 },
    '0x09bc4e0d864854c6afb6eb9a1add8900508d8b00':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Gnosis ─────────────────────────────────────────────────────────────────
  gnosis: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'xDAI',  decimals: 18 },
    '0xddafbb505ad214d7b80b1f1bfc074b78c4f4f94a':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Metis ──────────────────────────────────────────────────────────────────
  metis: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'METIS', decimals: 18 },
    '0x4300000000000000000000000000000000000004':        { symbol: 'USDT',  decimals: 6  },
  },
  // ── Boba ───────────────────────────────────────────────────────────────────
  boba: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0x461d52769884ca6235b6854942040b2a37583ea2':        { symbol: 'USDC',  decimals: 6  },
  },
  // ── Blast ──────────────────────────────────────────────────────────────────
  blast: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0x4300000000000000000000000000000000000001':        { symbol: 'USDB',  decimals: 18 },
    '0x8d11ec38a3eb5e956b420f7d121fe648de512efe':        { symbol: 'USDT',  decimals: 6  },
  },
  // ── Mode ────────────────────────────────────────────────────────────────────
  mode: {
    '0x0000000000000000000000000000000000000000':        { symbol: 'ETH',   decimals: 18 },
    '0x985505b79f8d31c7e7b664a6b5fc55a7c7f3d8e9':        { symbol: 'USDC',  decimals: 6  },
  },
};

// Native token symbol per chain
const NATIVE_SYMBOL: Record<string, string> = {
  ethereum:  'ETH',
  arbitrum:  'ETH',
  base:      'ETH',
  optimism:  'ETH',
  bsc:       'BNB',
  polygon:   'MATIC',
  avalanche: 'AVAX',
  zksync:    'ETH',
  linea:     'ETH',
  scroll:    'ETH',
  zkevm:     'ETH',
  mantle:    'MNT',
  gnosis:    'xDAI',
  metis:     'METIS',
  boba:      'ETH',
  blast:     'ETH',
  mode:      'ETH',
};

type AlertType =
  | 'large_transfer'
  | 'exchange_inflow'
  | 'exchange_outflow'
  | 'whale_movement'
  | 'bridge_deposit'
  | 'bridge_withdrawal';

interface WhaleAlert {
  tx_hash: string;
  chain: SupportedChain;
  block_number: bigint;
  timestamp: number;
  from_address: string;
  from_label: string | null;
  from_entity: string | null;
  from_type: string | null;
  to_address: string;
  to_label: string | null;
  to_entity: string | null;
  to_type: string | null;
  asset_address: string;
  asset_symbol: string;
  amount: string;
  amount_usd: number | null;
  alert_type: AlertType;
}

export class WhaleMonitor {
  private lastBlock: Partial<Record<SupportedChain, bigint>> = {};
  private failCount: Partial<Record<SupportedChain, number>> = {};
  private backoffUntil: Partial<Record<SupportedChain, number>> = {};
  private running = false;
  private timers: NodeJS.Timeout[] = [];

  // After 5 consecutive failures, back off for 10 minutes
  private readonly MAX_FAILS = 5;
  private readonly BACKOFF_MS = 10 * 60 * 1000;

  start(): void {
    if (this.running) return;
    this.running = true;
    enrichmentService.start();
    clusteringService.start();

    // Stagger start times to avoid RPC rate-limit burst.
    // Fast chains (3s block): BSC 15s polling.
    // Medium chains (1-2s block): ETH 30s, ARB/BASE/OP 45s, others 60s.
    // Slow chains (5s block): Gnosis 90s.
    const schedule: Array<[SupportedChain, number, number]> = [
      // Core chains (existing)
      ['ethereum',  30_000,  0],    // Alchemy
      ['bsc',       15_000,  3_000], // Fastest block time (3s)
      ['arbitrum',  45_000,  6_000],
      ['base',      45_000, 12_000],
      ['optimism',  45_000, 18_000],
      ['polygon',   45_000, 24_000],
      ['avalanche', 60_000, 30_000],
      // New chains
      ['zksync',    45_000, 36_000], // zkSync Era (1s block)
      ['linea',     45_000, 42_000], // Linea
      ['scroll',    60_000, 48_000], // Scroll (ZK rollup, ~1s)
      ['zkevm',     60_000, 54_000], // Polygon zkEVM
      ['mantle',    45_000, 60_000], // Mantle
      ['gnosis',    90_000, 66_000], // Gnosis (5s block, slow)
      ['metis',     60_000, 72_000], // Metis
      ['boba',      60_000, 78_000], // Boba
      ['blast',     45_000, 84_000], // Blast
      ['mode',      60_000, 90_000], // Mode
    ];

    for (const [chain, interval, delay] of schedule) {
      const t = setTimeout(() => {
        this.scanChain(chain);
        const timer = setInterval(() => this.scanChain(chain), interval);
        this.timers.push(timer);
      }, delay);
      this.timers.push(t);
    }

    console.log('[WhaleMonitor] Started — ' +
      'ETH/ARB/BASE/OP 30-45s / BSC 15s / AVAX/ZKSYNC/LINEA 45-60s / GNOSIS 90s (staggered)');
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.running = false;
    enrichmentService.stop();
    clusteringService.stop();
    console.log('[WhaleMonitor] Stopped');
  }

  private async scanChain(chain: SupportedChain): Promise<void> {
    const backoffUntil = this.backoffUntil[chain] ?? 0;
    if (backoffUntil > Date.now()) return;

    try {
      // Use cached block number (5s TTL) to avoid duplicate eth_blockNumber calls across chains
      const latestBlock = await rpcManager.getCachedBlockNumber(chain);
      const fromBlock = (this.lastBlock[chain] ?? latestBlock - 2n) + 1n;

      if (fromBlock > latestBlock) return;

      // Cap scan range to avoid overwhelming on first start
      const toBlock = latestBlock < fromBlock + 5n ? latestBlock : fromBlock + 4n;

      await this.scanBlocks(chain, fromBlock, toBlock);

      this.lastBlock[chain] = latestBlock;
      this.failCount[chain] = 0; // reset on success
      this.backoffUntil[chain] = 0;
    } catch (err) {
      const fails = (this.failCount[chain] ?? 0) + 1;
      this.failCount[chain] = fails;

      if (fails <= this.MAX_FAILS) {
        console.warn(`[WhaleMonitor] ${chain} scan error (${fails}/${this.MAX_FAILS}):`, (err as Error).message.slice(0, 80));
      } else if (fails === this.MAX_FAILS + 1) {
        console.warn(`[WhaleMonitor] ${chain} suspended for 10min after ${this.MAX_FAILS} failures.`);
        this.backoffUntil[chain] = Date.now() + this.BACKOFF_MS;
        // Reset fail count after backoff so it retries later
        setTimeout(() => {
          this.failCount[chain] = 0;
          this.backoffUntil[chain] = 0;
        }, this.BACKOFF_MS);
      }
      // If fails > MAX_FAILS, silently skip until backoff resets the counter
    }
  }

  /**
   * Unified block scanner — fetches native transfers + ERC20 logs using batched RPC calls.
   * All block data fetched in batch (vs. per-block RTT), then processed in parallel.
   */
  private async scanBlocks(
    chain: SupportedChain,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<void> {
    const nativeSymbol = NATIVE_SYMBOL[chain] ?? 'ETH';
    const nativePrice = await priceService.getPrice(nativeSymbol);

    // Generate block range
    const blockRange: bigint[] = [];
    for (let bn = fromBlock; bn <= toBlock; bn++) {
      blockRange.push(bn);
    }

    // Step 1: Batch fetch all blocks with transactions (single RTT for all blocks)
    const blocks = await this.fetchBlocksWithTxs(chain, blockRange);

    // Step 2: Batch fetch all ERC20 Transfer logs (already single getLogs call)
    const trackedAddresses = Object.keys(TRACKED_TOKENS[chain] ?? {}) as `0x${string}`[];
    let logs: Log[] = [];
    if (trackedAddresses.length > 0) {
      try {
        logs = await rpcManager.call(chain, (c) =>
          c.getLogs({
            fromBlock,
            toBlock,
            address: trackedAddresses,
            event: {
              type: 'event',
              name: 'Transfer',
              inputs: [
                { type: 'address', name: 'from', indexed: true },
                { type: 'address', name: 'to', indexed: true },
                { type: 'uint256', name: 'value', indexed: false },
              ],
            },
          })
        );
      } catch {
        logs = [];
      }
    }

    // Build block timestamp lookup from the blocks we already fetched
    const blockTimestampMap = new Map<bigint, number>();
    const txBlocks = new Map<bigint, BlockData>();
    for (const [bn, block] of blocks) {
      if (block?.timestamp) {
        blockTimestampMap.set(bn, Number(block.timestamp));
      }
      txBlocks.set(bn, block);
    }

    // Process native transfers (needs transactions)
    if (nativePrice && txBlocks.size > 0) {
      const nativeAlerts = await this.processNativeTransfers(chain, txBlocks, nativeSymbol, nativePrice);
      for (const alert of nativeAlerts) {
        await this.persistAlert(alert);
      }
    }

    // Process ERC20 transfers (needs timestamps only)
    if (logs.length > 0) {
      // Batch fetch timestamps for blocks we don't have yet (single batch RPC)
      const missingBlocks = blockRange.filter((bn) => !blockTimestampMap.has(bn));
      if (missingBlocks.length > 0) {
        const timestamps = await rpcManager.batchRpc(
          chain,
          missingBlocks.map((bn) => ({
            method: 'eth_getBlockByNumber',
            params: ['0x' + bn.toString(16), false],
          }))
        );
        timestamps.forEach((ts, i) => {
          if (ts && typeof ts === 'object') {
            const blockData = ts as { timestamp?: string };
            if (blockData.timestamp) {
              blockTimestampMap.set(missingBlocks[i], parseInt(blockData.timestamp, 16));
            }
          }
        });
      }

      const erc20Alerts = await this.processErc20Transfers(chain, logs, blockTimestampMap);
      for (const alert of erc20Alerts) {
        await this.persistAlert(alert);
      }
    }
  }

  /**
   * Fetch blocks with transactions in a single batch RPC call.
   * This is the most CU-intensive call but unavoidable for native transfer detection.
   */
  private async fetchBlocksWithTxs(
    chain: SupportedChain,
    blockNumbers: bigint[]
  ): Promise<Map<bigint, BlockData>> {
    // Use batch RPC to fetch all blocks with txs in one HTTP round-trip
    const results = await rpcManager.batchRpc(
      chain,
      blockNumbers.map((bn) => ({
        method: 'eth_getBlockByNumber',
        params: ['0x' + bn.toString(16), true], // includeTransactions: true
      }))
    );

    const map = new Map<bigint, BlockData>();
    results.forEach((result, i) => {
      if (result && typeof result === 'object') {
        const bd = result as Record<string, unknown>;
        const txs = (bd.transactions ?? []) as Array<Record<string, unknown>>;
        map.set(blockNumbers[i], {
          number: bd.number ? BigInt(bd.number as string) : blockNumbers[i],
          timestamp: bd.timestamp ? BigInt(bd.timestamp as string) : 0n,
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

  private async processNativeTransfers(
    chain: SupportedChain,
    blocks: Map<bigint, BlockData>,
    nativeSymbol: string,
    price: number
  ): Promise<WhaleAlert[]> {
    const alerts: WhaleAlert[] = [];

    for (const [blockNum, block] of blocks) {
      if (!block?.transactions?.length) continue;

      for (const tx of block.transactions) {
        if (!tx.value || tx.value === 0n) continue;
        if (!tx.to) continue;

        const amount = parseFloat(formatUnits(tx.value, 18));
        const amountUsd = amount * price;
        if (amountUsd < USD_THRESHOLD) continue;

        const timestamp = block.timestamp ? Number(block.timestamp) : Math.floor(Date.now() / 1000);

        const alert = await this.buildAlert({
          txHash: tx.hash,
          chain,
          blockNumber: block.number ?? blockNum,
          timestamp,
          from: tx.from,
          to: tx.to,
          assetAddress: NATIVE_TOKEN_ADDRESS,
          assetSymbol: nativeSymbol,
          amount: amount.toFixed(6),
          amountUsd,
        });

        alerts.push(alert);
      }
    }

    return alerts;
  }

  private async processErc20Transfers(
    chain: SupportedChain,
    logs: Log[],
    blockTimestampMap: Map<bigint, number>
  ): Promise<WhaleAlert[]> {
    const alerts: WhaleAlert[] = [];

    for (const log of logs) {
      if (!log.topics || log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
      if (!log.topics[1] || !log.topics[2]) continue;
      if (!log.data || log.data === '0x') continue;
      if (!log.address || !log.transactionHash) continue;

      const tokenAddr = log.address.toLowerCase();
      const tokenMeta = (TRACKED_TOKENS[chain] ?? {})[tokenAddr];
      if (!tokenMeta) continue;

      const from = ('0x' + log.topics[1].slice(26)) as `0x${string}`;
      const to   = ('0x' + log.topics[2].slice(26)) as `0x${string}`;
      const rawValue = BigInt(log.data);

      const amount = parseFloat(formatUnits(rawValue, tokenMeta.decimals));
      const tokenPrice = await priceService.getPrice(tokenMeta.symbol);
      const amountUsd = tokenPrice ? amount * tokenPrice : null;

      if (amountUsd === null || amountUsd < USD_THRESHOLD) continue;

      const blockNum = log.blockNumber!;
      const timestamp = blockTimestampMap.get(blockNum) ?? Math.floor(Date.now() / 1000);

      const alert = await this.buildAlert({
        txHash: log.transactionHash!,
        chain,
        blockNumber: blockNum,
        timestamp,
        from,
        to,
        assetAddress: tokenAddr,
        assetSymbol: tokenMeta.symbol,
        amount: amount.toFixed(tokenMeta.decimals > 6 ? 4 : 2),
        amountUsd,
      });

      alerts.push(alert);
    }

    return alerts;
  }

  private async buildAlert(params: {
    txHash: string;
    chain: SupportedChain;
    blockNumber: bigint;
    timestamp: number;
    from: string;
    to: string;
    assetAddress: string;
    assetSymbol: string;
    amount: string;
    amountUsd: number;
  }): Promise<WhaleAlert> {
    const { txHash, chain, blockNumber, timestamp, from, to, assetAddress, assetSymbol, amount, amountUsd } = params;

    const [fromEntity, toEntity] = await Promise.all([
      entityService.lookup(from, chain),
      entityService.lookup(to, chain),
    ]);

    // Auto-enrich unknown addresses in the background (P1)
    if (!fromEntity) enrichmentService.enqueue(from, chain);
    if (!toEntity)   enrichmentService.enqueue(to, chain);

    const alertType = this.classifyAlert(fromEntity?.entity_type, toEntity?.entity_type);

    return {
      tx_hash: txHash,
      chain,
      block_number: blockNumber,
      timestamp,
      from_address: from.toLowerCase(),
      from_label: fromEntity?.label ?? null,
      from_entity: fromEntity?.entity_name ?? null,
      from_type: fromEntity?.entity_type ?? null,
      to_address: to.toLowerCase(),
      to_label: toEntity?.label ?? null,
      to_entity: toEntity?.entity_name ?? null,
      to_type: toEntity?.entity_type ?? null,
      asset_address: assetAddress,
      asset_symbol: assetSymbol,
      amount,
      amount_usd: amountUsd,
      alert_type: alertType,
    };
  }

  private classifyAlert(fromType?: string | null, toType?: string | null): AlertType {
    if (toType === 'exchange') return 'exchange_inflow';
    if (fromType === 'exchange') return 'exchange_outflow';
    if (toType === 'bridge' || fromType === 'bridge') {
      return toType === 'bridge' ? 'bridge_deposit' : 'bridge_withdrawal';
    }
    if (fromType === 'fund' || toType === 'fund') return 'whale_movement';
    return 'large_transfer';
  }

  private async persistAlert(alert: WhaleAlert): Promise<void> {
    try {
      const result = await db.query(
        `INSERT INTO whale_alerts (
          tx_hash, chain, block_number, timestamp,
          from_address, from_label, from_entity, from_type,
          to_address,   to_label,   to_entity,   to_type,
          asset_address, asset_symbol, amount, amount_usd, alert_type
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        )
        ON CONFLICT (tx_hash, asset_address) DO NOTHING
        RETURNING id, created_at`,
        [
          alert.tx_hash, alert.chain, alert.block_number.toString(), alert.timestamp,
          alert.from_address, alert.from_label, alert.from_entity, alert.from_type,
          alert.to_address,   alert.to_label,   alert.to_entity,   alert.to_type,
          alert.asset_address, alert.asset_symbol,
          alert.amount, alert.amount_usd, alert.alert_type,
        ]
      );
      console.log(`[WhaleMonitor] 🐋 ${alert.chain} ${alert.alert_type} ${alert.asset_symbol} $${alert.amount_usd?.toFixed(0)} ${alert.from_entity ?? alert.from_address.slice(0, 8)} → ${alert.to_entity ?? alert.to_address.slice(0, 8)}`);

      // Emit SSE event + dispatch webhooks if new insert (not a duplicate)
      if (result.rowCount && result.rowCount > 0) {
        const row = result.rows[0];
        const payload = {
          ...alert,
          id: row.id,
          block_number: alert.block_number.toString(),
          created_at: row.created_at,
        };
        whaleAlertEmitter.emit('alert', payload);
        // Webhook dispatch + alert rules evaluation (both non-blocking)
        webhookService.dispatch(payload).catch(() => {});
        alertRulesService.evaluateAll(payload).catch(() => {});
      }
    } catch {
      // Duplicate or DB unavailable — ignore
    }
  }
}

export const whaleMonitor = new WhaleMonitor();
