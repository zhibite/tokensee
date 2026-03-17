/**
 * fetch-tokenlists.ts
 *
 * Fetches EVM token addresses from multiple official token lists:
 *   1. Uniswap default-token-list — 7 chains (mainnet/arbitrum/avalanche/base/bnb/optimism/polygon)
 *   2. Superchain Token List (ethereum-optimism) — ETH + OP + BASE bridge pairs
 *   3. Compound token list — cTokens + underlying assets
 *   4. Arbitrum One bridge token list
 *
 * entity_type : 'token' (stablecoins detected by symbol set → 'stablecoin')
 * confidence  : 'medium'
 * source      : 'uniswap-list' | 'superchain-list' | 'compound-list' | 'arbitrum-list'
 *
 * Usage:
 *   npm run fetch-tokenlists
 *   npm run fetch-tokenlists -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 200;

const CHAIN_ID_MAP: Record<number, string> = {
  1:     'ethereum',
  56:    'bsc',
  137:   'polygon',
  42161: 'arbitrum',
  8453:  'base',
  10:    'optimism',
  43114: 'avalanche',
};

const STABLECOIN_SYMBOLS = new Set([
  'USDC','USDT','DAI','BUSD','FRAX','LUSD','SUSD','TUSD','GUSD','USDP',
  'USDD','FDUSD','PYUSD','CRVUSD','MKUSD','EUSD','GHO','DOLA',
  'USDB','USDX','USDE','SUSDE','FRXETH','SFRXETH',
]);

interface TokenEntry {
  address: string;
  chain: string;
  label: string;
  entity_name: string;
  entity_type: string;
  source: string;
}

// ─── Source 1: Uniswap default-token-list ─────────────────────────────────────

const UNISWAP_FILES: { file: string }[] = [
  { file: 'mainnet'  },
  { file: 'arbitrum' },
  { file: 'avalanche'},
  { file: 'base'     },
  { file: 'bnb'      },
  { file: 'optimism' },
  { file: 'polygon'  },
];

const UNISWAP_BASE = 'https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens';

interface UniswapToken {
  name: string;
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
}

async function fetchUniswap(): Promise<TokenEntry[]> {
  const entries: TokenEntry[] = [];
  for (const { file } of UNISWAP_FILES) {
    const url = `${UNISWAP_BASE}/${file}.json`;
    try {
      const res = await axios.get<UniswapToken[]>(url, { timeout: 20_000 });
      const tokens = res.data;
      for (const t of tokens) {
        const chain = CHAIN_ID_MAP[t.chainId];
        if (!chain) continue;
        const addr = t.address.toLowerCase();
        if (!addr.startsWith('0x') || addr.length !== 42) continue;
        const sym = t.symbol?.toUpperCase() ?? '';
        entries.push({
          address:     addr,
          chain,
          label:       t.symbol ?? '',
          entity_name: t.name ?? t.symbol ?? '',
          entity_type: STABLECOIN_SYMBOLS.has(sym) ? 'stablecoin' : 'token',
          source:      'uniswap-list',
        });
      }
      console.log(`  [uniswap] ${file}.json — ${tokens.length} tokens`);
    } catch (err) {
      console.warn(`  [uniswap] ${file}.json — FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
  return entries;
}

// ─── Source 2: Superchain Token List (ethereum-optimism) ─────────────────────


const SUPERCHAIN_URL =
  'https://raw.githubusercontent.com/ethereum-optimism/ethereum-optimism.github.io/master/optimism.tokenlist.json';

interface SuperchainToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  extensions?: {
    optimismBridgeAddress?: string;
    baseBridgeAddress?: string;
    l2Bridge?: string;
  };
}

interface SuperchainList {
  tokens: SuperchainToken[];
}

async function fetchSuperchain(): Promise<TokenEntry[]> {
  const entries: TokenEntry[] = [];
  try {
    const res = await axios.get<SuperchainList>(SUPERCHAIN_URL, { timeout: 30_000 });
    const tokens = res.data.tokens ?? [];
    for (const t of tokens) {
      const chain = CHAIN_ID_MAP[t.chainId];
      if (!chain) continue;
      const addr = t.address.toLowerCase();
      if (!addr.startsWith('0x') || addr.length !== 42) continue;
      const sym = t.symbol?.toUpperCase() ?? '';
      entries.push({
        address:     addr,
        chain,
        label:       t.symbol ?? '',
        entity_name: t.name ?? t.symbol ?? '',
        entity_type: STABLECOIN_SYMBOLS.has(sym) ? 'stablecoin' : 'token',
        source:      'superchain-list',
      });
    }
    console.log(`  [superchain] ${tokens.length} tokens across all chains`);
  } catch (err) {
    console.warn(`  [superchain] FAILED: ${err instanceof Error ? err.message : err}`);
  }
  return entries;
}

// ─── Source 3+: Standard EIP-1155 token lists hosted on GitHub ───────────────
//
// Each entry: { url, source } — must return { tokens: [...] } or flat array
// All accessible via raw.githubusercontent.com (not blocked locally).

interface StandardTokenList {
  tokens: Array<{
    address: string;
    chainId: number;
    name: string;
    symbol: string;
    decimals?: number;
  }>;
}

const EXTRA_LISTS: Array<{ url: string; source: string }> = [
  {
    // Compound: cTokens + underlying assets (ETH mainnet)
    url:    'https://raw.githubusercontent.com/compound-finance/token-list/master/compound.tokenlist.json',
    source: 'compound-list',
  },
  {
    // Arbitrum One official bridge token list
    url:    'https://bridge.arbitrum.io/token-list-42161.json',
    source: 'arbitrum-list',
  },
  // Note: CoinGecko, Gemini, Zerion, 1inch token lists are blocked locally.
  // Run on server after deployment for broader coverage.
];

async function fetchStandardList(url: string, source: string): Promise<TokenEntry[]> {
  const entries: TokenEntry[] = [];
  try {
    const res = await axios.get<StandardTokenList | unknown[]>(url, { timeout: 20_000 });
    // Handle both { tokens: [...] } and flat array formats
    const raw = res.data;
    const tokens: StandardTokenList['tokens'] = Array.isArray(raw)
      ? (raw as StandardTokenList['tokens'])
      : ((raw as StandardTokenList).tokens ?? []);

    for (const t of tokens) {
      if (!t.address || !t.chainId) continue;
      const chain = CHAIN_ID_MAP[t.chainId];
      if (!chain) continue;
      const addr = t.address.toLowerCase();
      if (!addr.startsWith('0x') || addr.length !== 42) continue;
      const sym = t.symbol?.toUpperCase() ?? '';
      entries.push({
        address:     addr,
        chain,
        label:       t.symbol ?? '',
        entity_name: t.name ?? t.symbol ?? '',
        entity_type: STABLECOIN_SYMBOLS.has(sym) ? 'stablecoin' : 'token',
        source,
      });
    }
    console.log(`  [${source}] ${entries.length} tokens`);
  } catch (err) {
    console.warn(`  [${source}] FAILED: ${err instanceof Error ? err.message : err}`);
  }
  return entries;
}

// ─── Deduplicate ──────────────────────────────────────────────────────────────

function dedup(entries: TokenEntry[]): TokenEntry[] {
  const seen = new Set<string>();
  const result: TokenEntry[] = [];
  for (const e of entries) {
    const key = `${e.address}|${e.chain}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

// ─── DB Insert ────────────────────────────────────────────────────────────────

async function insertBatch(rows: TokenEntry[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    batch.forEach((e, idx) => {
      const b = idx * 6;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},'medium',$${b+6},'{}')`);
      values.push(e.address, e.chain, e.label, e.entity_name, e.entity_type, e.source);
    });
    try {
      const res = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        values,
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  DB error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-tokenlists — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  console.log('Fetching Uniswap default-token-list…');
  const uniswap = await fetchUniswap();

  console.log('\nFetching Superchain token list…');
  const superchain = await fetchSuperchain();

  console.log('\nFetching extra token lists…');
  const extras: TokenEntry[] = [];
  for (const { url, source } of EXTRA_LISTS) {
    const entries = await fetchStandardList(url, source);
    extras.push(...entries);
  }

  const all = dedup([...uniswap, ...superchain, ...extras]);

  // Chain summary
  const byChain: Record<string, number> = {};
  const bySrc: Record<string, number> = {};
  for (const e of all) {
    byChain[e.chain] = (byChain[e.chain] ?? 0) + 1;
    bySrc[e.source]  = (bySrc[e.source]  ?? 0) + 1;
  }
  console.log(`\nTotal unique entries: ${all.length}`);
  console.log('By source:', bySrc);
  console.log('By chain: ', byChain);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:', JSON.stringify(all.slice(0, 3), null, 2));
    return;
  }

  console.log('\nInserting into DB…');
  const inserted = await insertBatch(all);
  console.log(`Done — inserted ${inserted} new rows (${all.length - inserted} already existed)\n`);

  // Final per-source count
  const allSources = ['uniswap-list', 'superchain-list', ...EXTRA_LISTS.map((l) => l.source)];
  const r = await db.query<{ source: string; cnt: string }>(
    `SELECT source, COUNT(*) AS cnt FROM entities WHERE source = ANY($1) GROUP BY source ORDER BY COUNT(*) DESC`,
    [allSources],
  );
  for (const row of r.rows) console.log(`  ${row.source.padEnd(20)} ${row.cnt}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closePool());
