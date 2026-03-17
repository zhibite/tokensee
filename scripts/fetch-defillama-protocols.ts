/**
 * fetch-defillama-protocols.ts
 *
 * Fetches protocol contract addresses from DeFiLlama's /protocols endpoint.
 * This complements the existing fetch-external-labels.ts (which targets tokens)
 * and fetch-defillama-treasury.ts (which targets DAO treasury wallets).
 *
 * Filters to protocols that have an on-chain address on our supported EVM chains.
 *
 * Category → entity_type mapping:
 *   Bridge, Cross Chain          → 'bridge'
 *   CEX                          → 'exchange'
 *   Dexs, DEX                    → 'exchange'
 *   Lending, CDP, Reserve Curr.  → 'protocol'
 *   Yield, Yield Aggregator      → 'protocol'
 *   all others                   → 'protocol'
 *
 * entity_type : see above
 * confidence  : 'medium'
 * source      : 'defillama-protocols'
 *
 * Usage:
 *   npm run fetch-dl-protocols
 *   npm run fetch-dl-protocols -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 200;

const PROTOCOLS_URL = 'https://api.llama.fi/protocols';

// DeFiLlama chain prefix → our chain name
const CHAIN_PREFIX_MAP: Record<string, string> = {
  'ethereum':  'ethereum',
  'bsc':       'bsc',
  'binance':   'bsc',
  'arbitrum':  'arbitrum',
  'polygon':   'polygon',
  'base':      'base',
  'optimism':  'optimism',
  'avalanche': 'avalanche',
  'avax':      'avalanche',
};

// Supported chains (only insert for these)
const SUPPORTED_CHAINS = new Set(Object.values(CHAIN_PREFIX_MAP));

// Category → entity_type
function categoryToType(category: string): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('bridge') || c.includes('cross chain') || c.includes('cross-chain')) return 'bridge';
  if (c === 'cex') return 'exchange';
  if (c.includes('dex') || c.includes('dexs')) return 'exchange';
  return 'protocol';
}

interface DeFiLlamaProtocol {
  name: string;
  address?: string | null;
  chain?: string;
  category?: string;
}

interface Row {
  address: string;
  chain: string;
  label: string;
  entity_type: string;
}

function parseAddress(raw: string): { address: string; chain: string } | null {
  if (!raw || raw === 'null') return null;

  let chain = 'ethereum';
  let addr = raw;

  // Format: "arbitrum:0x..." or "0x..."
  if (raw.includes(':')) {
    const [prefix, rest] = raw.split(':', 2);
    const mapped = CHAIN_PREFIX_MAP[prefix.toLowerCase()];
    if (!mapped) return null; // non-EVM chain (tron, solana, etc.)
    chain = mapped;
    addr = rest;
  }

  addr = addr.toLowerCase();
  if (!addr.startsWith('0x') || addr.length !== 42) return null;
  if (!SUPPORTED_CHAINS.has(chain)) return null;

  return { address: addr, chain };
}

async function fetchProtocols(): Promise<Row[]> {
  const res = await axios.get<DeFiLlamaProtocol[]>(PROTOCOLS_URL, { timeout: 30_000 });
  const protocols = res.data;

  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const p of protocols) {
    if (!p.address) continue;

    const parsed = parseAddress(p.address);
    if (!parsed) continue;

    const key = `${parsed.address}|${parsed.chain}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      address:     parsed.address,
      chain:       parsed.chain,
      label:       p.name ?? '',
      entity_type: categoryToType(p.category ?? ''),
    });
  }

  return rows;
}

async function insertBatch(rows: Row[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    batch.forEach((r, idx) => {
      // label = entity_name (both use $b+3), entity_type is $b+4
      const b = idx * 4;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+3},$${b+4},'medium','defillama-protocols','{}')`);
      values.push(r.address, r.chain, r.label, r.entity_type);
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

async function main() {
  console.log(`fetch-defillama-protocols — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  console.log('Fetching DeFiLlama protocols…');
  const rows = await fetchProtocols();

  // Summary
  const byChain: Record<string, number> = {};
  const byType: Record<string, number>  = {};
  for (const r of rows) {
    byChain[r.chain] = (byChain[r.chain] ?? 0) + 1;
    byType[r.entity_type]  = (byType[r.entity_type]  ?? 0) + 1;
  }
  console.log(`  Total unique entries: ${rows.length}`);
  console.log('  By chain:', byChain);
  console.log('  By type: ', byType);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:', JSON.stringify(rows.slice(0, 4), null, 2));
    return;
  }

  console.log('\nInserting into DB…');
  const inserted = await insertBatch(rows);
  console.log(`Done — inserted ${inserted} new rows (${rows.length - inserted} already existed)\n`);

  const r = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source = 'defillama-protocols'`,
  );
  console.log(`  defillama-protocols total in DB: ${r.rows[0].cnt}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closePool());
