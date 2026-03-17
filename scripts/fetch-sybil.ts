/**
 * fetch-sybil.ts
 *
 * Fetches governance delegate addresses from the Uniswap Sybil verified list.
 * https://github.com/Uniswap/sybil-list
 *
 * Each address is a verified governance participant whose on-chain identity
 * has been linked to a Twitter/X handle via signed tweet.
 *
 * entity_type : 'kol'
 * confidence  : 'medium'
 * source      : 'sybil'
 * chain       : 'ethereum' (all Sybil addresses are Ethereum governance)
 *
 * Usage:
 *   npm run fetch-sybil
 *   npm run fetch-sybil -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN      = process.argv.includes('--dry-run');
const BATCH        = 200;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

const SYBIL_URL =
  'https://raw.githubusercontent.com/Uniswap/sybil-list/master/verified.json';

const HEADERS = {
  'User-Agent': 'tokensee-label-fetcher/1.0',
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

interface SybilEntry {
  twitter?: { handle?: string };
}

type SybilList = Record<string, SybilEntry>;

interface Row {
  address: string;
  label: string;
  entity_name: string;
}

async function fetchSybil(): Promise<Row[]> {
  const res = await axios.get<SybilList>(SYBIL_URL, { headers: HEADERS, timeout: 30_000 });
  const data = res.data;

  const rows: Row[] = [];
  for (const [addr, info] of Object.entries(data)) {
    const normalized = addr.toLowerCase();
    if (!normalized.startsWith('0x') || normalized.length !== 42) continue;

    const handle = info?.twitter?.handle ?? '';
    const label = handle ? `@${handle}` : normalized.slice(0, 10);

    rows.push({
      address:     normalized,
      label,
      entity_name: handle ? `@${handle}` : 'Governance Delegate',
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
      const b = idx * 3;
      placeholders.push(`($${b+1},'ethereum',$${b+2},$${b+3},'kol','medium','sybil','{"governance","delegate"}')`);
      values.push(r.address, r.label, r.entity_name);
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
  console.log(`fetch-sybil — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  console.log('Fetching Sybil verified list…');
  const rows = await fetchSybil();
  console.log(`  Found ${rows.length} verified governance addresses`);
  console.log(`  Sample: ${rows[0]?.label} → ${rows[0]?.address}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:', JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  console.log('\nInserting into DB…');
  const inserted = await insertBatch(rows);
  console.log(`Done — inserted ${inserted} new rows (${rows.length - inserted} already existed)\n`);

  const r = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source = 'sybil'`,
  );
  console.log(`  sybil total in DB: ${r.rows[0].cnt}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closePool());
