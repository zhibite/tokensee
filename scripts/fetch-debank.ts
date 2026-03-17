/**
 * fetch-debank.ts
 *
 * Imports protocol addresses from DeBank OpenAPI.
 *
 * Source:
 *   GET /v1/protocol/all_list?chain_ids=eth,bsc,...
 *   Returns all known protocols across multiple chains in one call.
 *   Protocol entries whose `id` is an address (0x...) are inserted as entity_type='protocol'.
 *
 * Note: /v1/token/all_list does NOT exist in DeBank API.
 *       Token lookups are individual by address only.
 *
 * Usage:
 *   npm run fetch-debank
 *   npm run fetch-debank -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

const API_KEY  = process.env.DEBANK_API_KEY ?? '';
const BASE_URL = 'https://pro-openapi.debank.com/v1';

if (!API_KEY) {
  console.error('DEBANK_API_KEY not set in .env');
  process.exit(1);
}

const http = axios.create({
  baseURL: BASE_URL,
  headers: { AccessKey: API_KEY },
  timeout: 30_000,
});

// DeBank chain_id ↔ our chain name
const CHAIN_MAP: Record<string, string> = {
  eth:    'ethereum',
  bsc:    'bsc',
  arb:    'arbitrum',
  matic:  'polygon',
  base:   'base',
  op:     'optimism',
  avax:   'avalanche',
};

const DB_URL = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString: DB_URL });

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface DebankProtocol {
  id: string;
  chain: string;
  name: string;
  tvl?: number;
  site_url?: string;
  logo_url?: string;
}

// ─── Fetch all protocols (one request, all chains) ────────────────────────────

async function fetchProtocols(): Promise<{ address: string; name: string; chain: string; tvl: number }[]> {
  const chainIds = Object.keys(CHAIN_MAP).join(',');
  console.log(`\n[Protocols] Fetching all_list for chains: ${chainIds}`);

  const res = await http.get<DebankProtocol[]>('/protocol/all_list', {
    params: { chain_ids: chainIds },
  });

  const results: { address: string; name: string; chain: string; tvl: number }[] = [];
  const chainStats: Record<string, number> = {};

  for (const p of res.data) {
    if (!ADDRESS_RE.test(p.id)) continue;         // skip slug-based IDs
    const ourChain = CHAIN_MAP[p.chain];
    if (!ourChain) continue;                       // skip unsupported chains
    results.push({ address: p.id.toLowerCase(), name: p.name, chain: ourChain, tvl: p.tvl ?? 0 });
    chainStats[p.chain] = (chainStats[p.chain] ?? 0) + 1;
  }

  console.log(`  Total protocols returned: ${res.data.length}`);
  console.log(`  Protocols with address IDs: ${results.length}`);
  for (const [chain, count] of Object.entries(chainStats)) {
    console.log(`    ${chain.padEnd(6)} | ${count}`);
  }

  return results;
}

// ─── Upsert to DB ─────────────────────────────────────────────────────────────

async function upsertBatch(
  rows: { address: string; label: string; entity_name: string; entity_type: string; chain: string; tags: string[] }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals: unknown[] = [];
    const phs: string[] = [];
    let idx = 1;
    for (const r of chunk) {
      phs.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      vals.push(
        r.address, r.chain, r.label.slice(0, 120),
        r.entity_name.slice(0, 80), r.entity_type,
        'medium', 'debank', JSON.stringify(r.tags),
      );
    }
    const res = await pool.query(
      `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
       VALUES ${phs.join(',')}
       ON CONFLICT (address, chain, source) DO UPDATE
         SET label       = EXCLUDED.label,
             entity_name = EXCLUDED.entity_name,
             updated_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      vals,
    );
    inserted += res.rows.filter((r) => r.inserted).length;
  }
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-debank — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const protos = await fetchProtocols();

  if (DRY_RUN) {
    console.log(`\n  [dry-run] would insert up to ${protos.length} protocol entries`);
    protos.slice(0, 5).forEach((p) => console.log(`    ${p.chain} ${p.address} "${p.name}"`));
    await pool.end();
    return;
  }

  if (protos.length === 0) {
    console.log('\n  No protocols to insert.');
    await pool.end();
    return;
  }

  const rows = protos.map((p) => ({
    address:     p.address,
    label:       p.name,
    entity_name: p.name,
    entity_type: 'protocol',
    chain:       p.chain,
    tags:        ['defi', p.tvl > 1_000_000 ? 'tvl-1m+' : 'small-tvl'],
  }));

  const n = await upsertBatch(rows);
  console.log(`\n  → ${n} new protocol entries inserted`);
  console.log(`\n===== Total new: ${n} =====\n`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
