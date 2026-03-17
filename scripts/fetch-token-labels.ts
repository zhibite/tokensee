/**
 * fetch-token-labels.ts — P2 supplement
 *
 * Pulls token contract addresses from sources accessible locally:
 *   1. DeFiLlama /stablecoins         — all stablecoin contracts across chains
 *   2. DeFiLlama /bridges              — bridge protocol addresses
 *   3. DeFiLlama /yields/pools         — major DeFi pool token addresses
 *   4. GitHub raw: uniswap/token-lists — default + extended token list (large)
 *
 * These collectively cover what CoinGecko would provide without needing their API.
 *
 * Usage:
 *   npm run fetch-tokens
 *   npm run fetch-tokens -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const CHAIN_MAP: Record<string, string> = {
  'Ethereum':  'ethereum',
  'BSC':       'bsc',
  'Arbitrum':  'arbitrum',
  'Polygon':   'polygon',
  'Base':      'base',
  'Optimism':  'optimism',
  'Avalanche': 'avalanche',
  // aliases
  'arbitrum':  'arbitrum',
  'polygon':   'polygon',
  'base':      'base',
  'optimism':  'optimism',
  'avalanche': 'avalanche',
  'bsc':       'bsc',
  'ethereum':  'ethereum',
};

/** Uniswap chain id → our chain name */
const CHAINID_MAP: Record<number, string> = {
  1:     'ethereum',
  56:    'bsc',
  42161: 'arbitrum',
  137:   'polygon',
  8453:  'base',
  10:    'optimism',
  43114: 'avalanche',
};

interface LabelEntry {
  address: string; chain: string; label: string;
  entity_name: string; entity_type: string; source: string;
}

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`  [dry-run] would insert ${entries.length} entries`);
    return entries.length;
  }

  let inserted = 0;
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const base = idx * 6;
      placeholders.push(
        `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},'medium',$${base+6},'{}')`
      );
      values.push(e.address.toLowerCase(), e.chain, e.label, e.entity_name, e.entity_type, e.source);
    });

    try {
      const res = await db.query(
        `INSERT INTO entities (address,chain,label,entity_name,entity_type,confidence,source,tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        values
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  [insert error]', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Source 1: DeFiLlama Stablecoins ──────────────────────────────────────────

async function fetchStablecoins(): Promise<number> {
  console.log('\n[DeFiLlama Stablecoins] Fetching...');
  try {
    const resp = await axios.get('https://stablecoins.llama.fi/stablecoins?includePrices=false', { timeout: 15_000 });
    const list = resp.data?.peggedAssets as Array<{
      name: string; symbol: string;
      chainCirculating: Record<string, unknown>;
      chains: string[];
    }> | undefined;
    if (!list) return 0;

    const entries: LabelEntry[] = [];
    for (const coin of list) {
      if (!coin.chainCirculating) continue;
      for (const chainKey of Object.keys(coin.chainCirculating)) {
        const chain = CHAIN_MAP[chainKey];
        if (!chain) continue;

        const data = coin.chainCirculating[chainKey] as Record<string, unknown> | null;
        if (!data) continue;

        // address is sometimes in 'tokenAddress'
        const addr = (data as { tokenAddress?: string }).tokenAddress;
        if (!addr || !addr.startsWith('0x') || addr.length !== 42) continue;

        const symbol = coin.symbol?.toUpperCase() ?? '';
        entries.push({
          address:     addr.toLowerCase(),
          chain,
          label:       symbol ? `${coin.name} (${symbol})` : coin.name,
          entity_name: coin.name,
          entity_type: 'stablecoin',
          source:      'defillama-stables',
        });
      }
    }

    console.log(`[DeFiLlama Stablecoins] Prepared ${entries.length} entries`);
    const n = await insertBatch(entries);
    console.log(`[DeFiLlama Stablecoins] ✅ Inserted ${n} new entries`);
    return n;
  } catch (err) {
    console.log(`[DeFiLlama Stablecoins] Skipped — ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

// ─── Source 2: DeFiLlama Bridges ─────────────────────────────────────────────

async function fetchBridges(): Promise<number> {
  console.log('\n[DeFiLlama Bridges] Fetching...');
  try {
    const resp = await axios.get('https://bridges.llama.fi/bridges', { timeout: 15_000 });
    const list = resp.data?.bridges as Array<{
      displayName: string;
      chains: string[];
      chainToChainVolume?: Record<string, unknown>;
    }> | undefined;
    if (!list) return 0;

    // Bridge protocols themselves — no per-chain address from this endpoint,
    // but we can track the bridge name for later enrichment
    console.log(`[DeFiLlama Bridges] Got ${list.length} bridges (metadata only, no per-chain addresses)`);
    return 0; // Skip — no contract addresses in this endpoint
  } catch (err) {
    console.log(`[DeFiLlama Bridges] Skipped — ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

// ─── Source 3: Uniswap Default Token List ────────────────────────────────────

async function fetchUniswapTokenList(): Promise<number> {
  console.log('\n[Uniswap Token List] Fetching...');
  const lists = [
    'https://tokens.uniswap.org',  // official Uniswap default list
    'https://gateway.ipfs.io/ipns/tokens.uniswap.org', // IPFS mirror
  ];

  let tokenList: Array<{ name: string; symbol: string; chainId: number; address: string; decimals: number }> | null = null;

  for (const url of lists) {
    try {
      const resp = await axios.get(url, { timeout: 12_000 });
      tokenList = resp.data?.tokens;
      if (tokenList && tokenList.length > 0) {
        console.log(`[Uniswap Token List] Got ${tokenList.length} tokens from ${url}`);
        break;
      }
    } catch {
      // try next mirror
    }
  }

  if (!tokenList) {
    console.log('[Uniswap Token List] Unavailable — skipping');
    return 0;
  }

  const entries: LabelEntry[] = [];
  for (const token of tokenList) {
    const chain = CHAINID_MAP[token.chainId];
    if (!chain) continue;
    if (!token.address || !token.address.startsWith('0x') || token.address.length !== 42) continue;

    const label = token.symbol ? `${token.name} (${token.symbol})` : token.name;
    entries.push({
      address:     token.address.toLowerCase(),
      chain,
      label,
      entity_name: token.name,
      entity_type: 'protocol',
      source:      'uniswap-tokenlist',
    });
  }

  console.log(`[Uniswap Token List] Prepared ${entries.length} entries`);
  const n = await insertBatch(entries);
  console.log(`[Uniswap Token List] ✅ Inserted ${n} new entries`);
  return n;
}

// ─── Source 4: 1inch Token List ──────────────────────────────────────────────

async function fetch1inchTokenList(): Promise<number> {
  const CHAIN_IDS = [1, 56, 42161, 137, 8453, 10, 43114];
  console.log('\n[1inch Token List] Fetching across chains...');

  let total = 0;
  for (const chainId of CHAIN_IDS) {
    const chain = CHAINID_MAP[chainId];
    if (!chain) continue;

    try {
      const resp = await axios.get(`https://tokens.1inch.io/v1.2/${chainId}`, { timeout: 10_000 });
      const tokens = resp.data as Record<string, { name: string; symbol: string; address: string }>;
      if (!tokens || typeof tokens !== 'object') continue;

      const entries: LabelEntry[] = [];
      for (const token of Object.values(tokens)) {
        if (!token.address || !token.address.startsWith('0x') || token.address.length !== 42) continue;
        const symbol = token.symbol?.toUpperCase() ?? '';
        const label  = symbol ? `${token.name} (${symbol})` : token.name;

        entries.push({
          address:     token.address.toLowerCase(),
          chain,
          label,
          entity_name: token.name,
          entity_type: 'protocol',
          source:      '1inch-tokenlist',
        });
      }

      const n = await insertBatch(entries);
      console.log(`  chain=${chain} (${chainId}) — ${entries.length} tokens → ${n} new`);
      total += n;
    } catch (err) {
      console.log(`  chain=${chain} — skipped (${err instanceof Error ? err.message.slice(0, 60) : err})`);
    }
  }

  console.log(`[1inch Token List] ✅ Total inserted: ${total}`);
  return total;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  try {
    const result = await db.query<{ entity_type: string; source: string; cnt: string }>(
      `SELECT entity_type, source, COUNT(*) AS cnt FROM entities
       GROUP BY entity_type, source ORDER BY cnt DESC`
    );
    console.log('\n── Entity Library Stats ──────────────────────────────');
    let total = 0;
    for (const row of result.rows) {
      console.log(`  ${row.entity_type.padEnd(14)} ${row.source.padEnd(20)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(35)} ${total}`);
  } catch { /* DB not available */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-token-labels — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let total = 0;
  total += await fetchStablecoins();
  total += await fetchBridges();
  total += await fetchUniswapTokenList();
  total += await fetch1inchTokenList();

  console.log(`\n✅ Total new entries: ${total}`);
  await printStats();
  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
