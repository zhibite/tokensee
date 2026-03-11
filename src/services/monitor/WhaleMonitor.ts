/**
 * WhaleMonitor — polls latest blocks on each chain, detects large transfers,
 * enriches with entity labels, and persists to whale_alerts table.
 *
 * Runs as a background interval in src/index.ts.
 * Polling interval: 30s ETH (12s block), 15s BSC (3s block)
 */

import { EventEmitter } from 'events';
import { formatUnits, type Log } from 'viem';
import { rpcManager } from '../rpc/RpcManager.js';
import { entityService } from '../entity/EntityService.js';
import { enrichmentService } from '../entity/EnrichmentService.js';
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

// USD threshold to qualify as a "whale" alert
const USD_THRESHOLD = 100_000;

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
  private running = false;
  private timers: NodeJS.Timeout[] = [];

  // After 5 consecutive failures, back off for 10 minutes
  private readonly MAX_FAILS = 5;
  private readonly BACKOFF_MS = 10 * 60 * 1000;

  start(): void {
    if (this.running) return;
    this.running = true;
    enrichmentService.start();

    // Stagger start times to avoid Alchemy rate-limit burst.
    // ETH uses dedicated Alchemy key → 30s. BSC uses public RPC → 15s.
    // ARB/BASE/OP share one Alchemy key → spread across 45s each.
    // POLYGON uses public fallback → 45s. AVAX uses public RPC → 60s.
    const schedule: Array<[SupportedChain, number, number]> = [
      ['ethereum', 30_000,  0],
      ['bsc',      15_000,  3_000],
      ['arbitrum', 45_000,  6_000],
      ['base',     45_000, 12_000],
      ['optimism', 45_000, 18_000],
      ['polygon',  45_000, 24_000],
      ['avalanche',60_000, 30_000],
    ];

    for (const [chain, interval, delay] of schedule) {
      const t = setTimeout(() => {
        this.scanChain(chain);
        const timer = setInterval(() => this.scanChain(chain), interval);
        this.timers.push(timer);
      }, delay);
      this.timers.push(t);
    }

    console.log('[WhaleMonitor] Started — ETH 30s / BSC 15s / ARB 45s / BASE 45s / OP 45s / POLYGON 45s / AVAX 60s (staggered)');
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.running = false;
    enrichmentService.stop();
    console.log('[WhaleMonitor] Stopped');
  }

  private async scanChain(chain: SupportedChain): Promise<void> {
    try {
      const latestBlock = await rpcManager.call(chain, (c) => c.getBlockNumber());
      const fromBlock = (this.lastBlock[chain] ?? latestBlock - 2n) + 1n;

      if (fromBlock > latestBlock) return;

      // Cap scan range to avoid overwhelming on first start
      const toBlock = latestBlock < fromBlock + 5n ? latestBlock : fromBlock + 4n;

      await this.scanNativeTransfers(chain, fromBlock, toBlock);
      await this.scanErc20Transfers(chain, fromBlock, toBlock);

      this.lastBlock[chain] = latestBlock;
      this.failCount[chain] = 0; // reset on success
    } catch (err) {
      const fails = (this.failCount[chain] ?? 0) + 1;
      this.failCount[chain] = fails;

      if (fails <= this.MAX_FAILS) {
        console.warn(`[WhaleMonitor] ${chain} scan error (${fails}/${this.MAX_FAILS}):`, (err as Error).message.slice(0, 80));
      } else if (fails === this.MAX_FAILS + 1) {
        console.warn(`[WhaleMonitor] ${chain} suspended for 10min after ${this.MAX_FAILS} failures.`);
        // Reset fail count after backoff so it retries later
        setTimeout(() => { this.failCount[chain] = 0; }, this.BACKOFF_MS);
      }
      // If fails > MAX_FAILS, silently skip until backoff resets the counter
    }
  }

  /**
   * Detect large native ETH/BNB transfers by scanning blocks directly
   */
  private async scanNativeTransfers(
    chain: SupportedChain,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<void> {
    const nativeSymbol = NATIVE_SYMBOL[chain] ?? 'ETH';
    const price = await priceService.getPrice(nativeSymbol);
    if (!price) return;

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await rpcManager.call(chain, (c) =>
          c.getBlock({ blockNumber: blockNum, includeTransactions: true })
        );

        for (const tx of block.transactions) {
          if (typeof tx === 'string') continue;
          if (!tx.value || tx.value === 0n) continue;
          if (!tx.to) continue; // contract deploy

          const amount = parseFloat(formatUnits(tx.value, 18));
          const amountUsd = amount * price;
          if (amountUsd < USD_THRESHOLD) continue;

          const alert = await this.buildAlert({
            txHash: tx.hash,
            chain,
            blockNumber: block.number ?? blockNum,
            timestamp: Number(block.timestamp),
            from: tx.from,
            to: tx.to,
            assetAddress: NATIVE_TOKEN_ADDRESS,
            assetSymbol: nativeSymbol,
            amount: amount.toFixed(6),
            amountUsd,
          });

          await this.persistAlert(alert);
        }
      } catch {
        // skip individual block failures
      }
    }
  }

  /**
   * Detect large ERC-20 transfers via Transfer event logs
   */
  private async scanErc20Transfers(
    chain: SupportedChain,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<void> {
    const trackedAddresses = Object.keys(TRACKED_TOKENS[chain] ?? {}) as `0x${string}`[];
    if (trackedAddresses.length === 0) return;

    let logs: Log[];
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
      return;
    }

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
      const price = await priceService.getPrice(tokenMeta.symbol);
      const amountUsd = price ? amount * price : null;

      if (amountUsd === null || amountUsd < USD_THRESHOLD) continue;

      const block = await rpcManager.call(chain, (c) =>
        c.getBlock({ blockNumber: log.blockNumber! })
      ).catch(() => null);

      const alert = await this.buildAlert({
        txHash: log.transactionHash!,
        chain,
        blockNumber: log.blockNumber!,
        timestamp: block ? Number(block.timestamp) : Math.floor(Date.now() / 1000),
        from,
        to,
        assetAddress: tokenAddr,
        assetSymbol: tokenMeta.symbol,
        amount: amount.toFixed(tokenMeta.decimals > 6 ? 4 : 2),
        amountUsd,
      });

      await this.persistAlert(alert);
    }
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
