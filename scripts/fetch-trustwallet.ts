/**
 * fetch-trustwallet.ts
 *
 * Fetches token lists from Trust Wallet assets repo.
 * Uses the per-chain tokenlist.json (no GitHub API / auth required).
 *
 * Source: https://github.com/trustwallet/assets
 * URL pattern: blockchains/{chain}/tokenlist.json
 *
 * token type → entity_type mapping:
 *   stablecoin tag → stablecoin
 *   ERC721/ERC1155 → nft
 *   ERC20 (default) → token
 *
 * Usage:
 *   npm run fetch-trustwallet
 *   npm run fetch-trustwallet -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const RAW_BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

// Trust Wallet chain name → our chain name
const CHAIN_MAP: Record<string, string> = {
  ethereum:    'ethereum',
  smartchain:  'bsc',
  polygon:     'polygon',
  arbitrum:    'arbitrum',
  base:        'base',
  optimism:    'optimism',
  avalanchec:  'avalanche',
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Token list item ──────────────────────────────────────────────────────────

interface TrustToken {
  address: string;
  name: string;
  symbol: string;
  type?: string;       // ERC20, ERC721, BEP20, etc.
  tags?: string[];     // stablecoin, defi, etc.
}

interface TokenList {
  tokens: TrustToken[];
}

// ─── Determine entity_type from token metadata ────────────────────────────────

function resolveType(token: TrustToken): string {
  if (token.tags?.includes('stablecoin')) return 'stablecoin';
  const t = (token.type ?? '').toUpperCase();
  if (t === 'ERC721' || t === 'ERC1155') return 'nft';
  return 'token';
}

// ─── Fetch one chain's token list ─────────────────────────────────────────────

interface LabelEntry {
  address: string; chain: string; label: string; entity_name: string; entity_type: string;
}

async function fetchChain(twChain: string, ourChain: string): Promise<LabelEntry[]> {
  const url = `${RAW_BASE}/${twChain}/tokenlist.json`;
  let data: TokenList | null = null;

  try {
    const res = await axios.get<TokenList>(url, { timeout: 20_000 });
    data = res.data;
  } catch {
    console.log(`  [${twChain}] fetch failed or no tokenlist`);
    return [];
  }

  if (!data?.tokens?.length) return [];

  const entries: LabelEntry[] = [];
  for (const token of data.tokens) {
    const addr = token.address?.toLowerCase();
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) continue;
    if (!token.name) continue;

    const symbol = token.symbol ? ` (${token.symbol})` : '';
    entries.push({
      address:     addr,
      chain:       ourChain,
      label:       `${token.name}${symbol}`.slice(0, 120),
      entity_name: token.name.slice(0, 80),
      entity_type: resolveType(token),
    });
  }
  return entries;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += 300) {
    const chunk = entries.slice(i, i + 300);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const b = idx * 6;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},'high',$${b+6},'{}')`);
      values.push(e.address, e.chain, e.label, e.entity_name, e.entity_type, 'trustwallet');
    });

    try {
      const res = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        values
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  DB error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-trustwallet — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Source: Trust Wallet assets tokenlist.json\n');

  let grandTotal = 0;
  const allEntries: LabelEntry[] = [];

  for (const [twChain, ourChain] of Object.entries(CHAIN_MAP)) {
    process.stdout.write(`  [${twChain}] fetching…`);
    const entries = await fetchChain(twChain, ourChain);
    console.log(` ${entries.length} tokens`);
    allEntries.push(...entries);
    await sleep(300);
  }

  // Deduplicate by address+chain
  const unique = [...new Map(allEntries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`\nTotal: ${unique.length} unique token addresses`);

  // Type breakdown
  const byType: Record<string, number> = {};
  for (const e of unique) byType[e.entity_type] = (byType[e.entity_type] ?? 0) + 1;
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t.padEnd(12)} ${n}`);

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.chain.padEnd(10)} ${e.address}  ${e.label.slice(0, 30)}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  grandTotal += inserted;
  console.log(`\n✅ Inserted ${grandTotal} new token entries`);

  try {
    const r = await db.query<{ chain: string; cnt: string }>(
      `SELECT chain, COUNT(*) AS cnt FROM entities WHERE source = 'trustwallet' GROUP BY chain ORDER BY cnt DESC`
    );
    console.log('\n── Trust Wallet entries by chain ────────────────');
    let total = 0;
    for (const row of r.rows) {
      console.log(`  ${row.chain.padEnd(12)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
