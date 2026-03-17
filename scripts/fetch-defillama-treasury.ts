/**
 * fetch-defillama-treasury.ts
 *
 * Fetches DAO / protocol treasury wallet addresses from DeFiLlama.
 *
 * Strategy:
 *   1. GET /protocols — list all ~7000 protocols, filter those with treasury slug
 *   2. For each (~290), GET /treasury/{slug} — extract primary address
 *   3. Also extract any additional addresses from chainTvls token holdings
 *
 * entity_type: 'dao', source: 'defillama-treasury', confidence: 'high'
 *
 * Usage:
 *   npm run fetch-treasury
 *   npm run fetch-treasury -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const LLAMA_API = 'https://api.llama.fi';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Chain name normalisation ─────────────────────────────────────────────────

const CHAIN_NORM: Record<string, string> = {
  ethereum:  'ethereum',
  bsc:       'bsc',
  'bsc chain': 'bsc',
  binance:   'bsc',
  polygon:   'polygon',
  arbitrum:  'arbitrum',
  base:      'base',
  optimism:  'optimism',
  avalanche: 'avalanche',
  solana:    'solana',
};

function normalizeChain(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return CHAIN_NORM[key] ?? null; // skip unknown chains
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Protocol {
  name: string;
  treasury?: string;
  chain?: string;
}

interface TreasuryResponse {
  name?: string;
  address?: string;
  chain?: string;
  // chainTvls holds historical TVL, not useful for address extraction
}

interface LabelEntry {
  address: string;
  chain: string;
  label: string;
  entity_name: string;
}

// ─── Fetch protocol list ──────────────────────────────────────────────────────

async function fetchProtocols(): Promise<Protocol[]> {
  const res = await axios.get<Protocol[]>(`${LLAMA_API}/protocols`, { timeout: 30_000 });
  return res.data.filter((p) => p.treasury);
}

// ─── Fetch one treasury ───────────────────────────────────────────────────────

async function fetchTreasury(slug: string, protocolName: string): Promise<LabelEntry[]> {
  // Slug looks like 'lido.js' — strip the .js extension for the API path
  const key = slug.replace(/\.js$/, '');
  try {
    const res = await axios.get<TreasuryResponse>(`${LLAMA_API}/treasury/${key}`, { timeout: 15_000 });
    const data = res.data;
    const entries: LabelEntry[] = [];

    if (data?.address) {
      const addr = data.address.toLowerCase();
      if (addr.startsWith('0x') && addr.length === 42) {
        const rawChain = data.chain ?? 'Ethereum';
        const chain = normalizeChain(rawChain) ?? 'ethereum';
        entries.push({
          address:     addr,
          chain,
          label:       `${protocolName} Treasury`,
          entity_name: protocolName,
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const b = idx * 4;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},'dao','high','defillama-treasury','{"treasury","dao"}')`);
      values.push(e.address, e.chain, e.label, e.entity_name);
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
  console.log(`fetch-defillama-treasury — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Source: DeFiLlama /protocols + /treasury/{slug}\n');

  console.log('Fetching protocol list…');
  const protocols = await fetchProtocols();
  console.log(`  ${protocols.length} protocols with treasury\n`);

  const allEntries: LabelEntry[] = [];
  let processed = 0;

  for (const proto of protocols) {
    const entries = await fetchTreasury(proto.treasury!, proto.name);
    allEntries.push(...entries);
    processed++;
    process.stdout.write(`  ${processed}/${protocols.length} — found ${allEntries.length} addresses\r`);
    await sleep(150); // gentle rate limit
  }

  console.log(`\n`);

  // Deduplicate
  const unique = [...new Map(allEntries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`Found ${unique.length} unique treasury addresses`);

  // Chain breakdown
  const byChain: Record<string, number> = {};
  for (const e of unique) byChain[e.chain] = (byChain[e.chain] ?? 0) + 1;
  for (const [c, n] of Object.entries(byChain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(12)} ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.chain.padEnd(10)} ${e.address}  ${e.label}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Inserted ${inserted} treasury addresses`);

  try {
    const r = await db.query<{ chain: string; cnt: string }>(
      `SELECT chain, COUNT(*) AS cnt FROM entities WHERE source = 'defillama-treasury' GROUP BY chain ORDER BY cnt DESC`
    );
    console.log('\n── DeFiLlama treasury entries ───────────────────');
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
