/**
 * fetch-dl-pools.ts
 *
 * Extracts EVM token addresses from DeFiLlama Yields API pool data.
 *
 * Source:
 *   GET https://yields.llama.fi/pools
 *   Each pool entry contains `underlyingTokens` and `rewardTokens` arrays
 *   which hold actual EVM contract addresses of the tokens involved.
 *
 * Note: the `pool` field is a UUID (DeFiLlama internal ID), not a contract address.
 *       We extract the underlying/reward token addresses instead.
 *
 * entity_type : 'token'
 * confidence  : 'medium'
 * source      : 'defillama-pools'
 *
 * Usage:
 *   npm run fetch-dl-pools
 *   npm run fetch-dl-pools -- --dry-run
 *   npm run fetch-dl-pools -- --min-tvl=1000000
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 500;

const MIN_TVL = (() => {
  const m = process.argv.join(' ').match(/--min-tvl=(\d+)/);
  return m ? Number(m[1]) : 0;
})();

const POOLS_URL = 'https://yields.llama.fi/pools';

// DeFiLlama yields API uses Title Case chain names
const CHAIN_NAME_MAP: Record<string, string> = {
  'ethereum':  'ethereum',
  'bsc':       'bsc',
  'binance':   'bsc',
  'arbitrum':  'arbitrum',
  'polygon':   'polygon',
  'base':      'base',
  'optimism':  'optimism',
  'avalanche': 'avalanche',
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface DlPool {
  pool:              string;
  chain:             string;
  project:           string;
  symbol:            string;
  tvlUsd?:           number;
  underlyingTokens?: string[] | null;
  rewardTokens?:     string[] | null;
}

interface Row {
  address:     string;
  chain:       string;
  entity_name: string;
}

async function fetchTokenAddresses(): Promise<Row[]> {
  console.log('Fetching DeFiLlama yield pools…');
  const res = await axios.get<{ data: DlPool[] }>(POOLS_URL, { timeout: 60_000 });
  const pools = res.data.data;
  console.log(`  API returned ${pools.length} total pools`);

  const seen = new Set<string>();
  const rows: Row[] = [];
  let poolsProcessed = 0;

  for (const p of pools) {
    const ourChain = CHAIN_NAME_MAP[p.chain.toLowerCase()];
    if (!ourChain) continue;
    if (MIN_TVL > 0 && (p.tvlUsd ?? 0) < MIN_TVL) continue;

    const addrs = [
      ...(p.underlyingTokens ?? []),
      ...(p.rewardTokens ?? []),
    ];

    let added = false;
    for (const addr of addrs) {
      if (!ADDRESS_RE.test(addr)) continue;
      if (addr === '0x0000000000000000000000000000000000000000') continue; // native ETH
      const key = `${addr.toLowerCase()}|${ourChain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        address:     addr.toLowerCase(),
        chain:       ourChain,
        entity_name: p.project,
      });
      added = true;
    }
    if (added) poolsProcessed++;
  }

  console.log(`  Pools with EVM token addresses: ${poolsProcessed}`);
  return rows;
}

async function insertBatch(rows: Row[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const phs: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const r of batch) {
      // label = address prefix for unknown tokens; entity_name = project
      phs.push(`($${idx++},$${idx++},$${idx++},$${idx++},'token','medium','defillama-pools','{}')`);
      vals.push(r.address, r.chain, r.entity_name, r.entity_name);
    }
    try {
      const res = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${phs.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        vals,
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  DB error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

async function main() {
  console.log(`fetch-dl-pools — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | min-tvl: $${MIN_TVL.toLocaleString()}\n`);

  const rows = await fetchTokenAddresses();

  // Summary by chain + project
  const byChain: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  for (const r of rows) {
    byChain[r.chain] = (byChain[r.chain] ?? 0) + 1;
    byProject[r.entity_name] = (byProject[r.entity_name] ?? 0) + 1;
  }

  const topProjects = Object.entries(byProject)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k}(${v})`)
    .join(', ');

  console.log(`\n  Unique token addresses to insert: ${rows.length}`);
  console.log('  By chain:', byChain);
  console.log('  Top projects:', topProjects);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:');
    rows.slice(0, 5).forEach((r) =>
      console.log(`  ${r.chain.padEnd(10)} ${r.address}  (${r.entity_name})`),
    );
    return;
  }

  console.log('\nInserting into DB…');
  const inserted = await insertBatch(rows);
  console.log(`Done — inserted ${inserted} new rows (${rows.length - inserted} already existed)\n`);

  const r = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source = 'defillama-pools'`,
  );
  console.log(`  defillama-pools total in DB: ${r.rows[0].cnt}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closePool());
