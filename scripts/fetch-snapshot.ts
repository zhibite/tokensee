/**
 * fetch-snapshot.ts
 *
 * Fetches DAO treasury (multisig) addresses from Snapshot.
 * https://hub.snapshot.org/graphql
 *
 * Strategy:
 *   Paginate through all Snapshot spaces, extract `treasuries` field.
 *   Each treasury: { network: chainId, address: 0x... }
 *
 * Chains: filters to EVM chains we support (1/56/137/42161/8453/10/43114)
 *
 * entity_type: 'dao', confidence: 'medium', source: 'snapshot'
 *
 * Usage:
 *   npm run fetch-snapshot
 *   npm run fetch-snapshot -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const SNAPSHOT_GRAPHQL = 'https://hub.snapshot.org/graphql';

const CHAIN_MAP: Record<string, string> = {
  '1':     'ethereum',
  '56':    'bsc',
  '137':   'polygon',
  '42161': 'arbitrum',
  '8453':  'base',
  '10':    'optimism',
  '43114': 'avalanche',
};

const PAGE_SIZE = 1000;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── GraphQL query ────────────────────────────────────────────────────────────

const SPACES_QUERY = `
  query Spaces($first: Int!, $skip: Int!) {
    spaces(first: $first, skip: $skip, orderBy: "created", orderDirection: asc) {
      id
      name
      treasuries {
        network
        address
        name
      }
    }
  }
`;

interface SnapshotTreasury {
  network?: string;
  address?: string;
  name?: string;
}

interface SnapshotSpace {
  id: string;
  name?: string;
  treasuries?: SnapshotTreasury[];
}

interface LabelEntry {
  address: string;
  chain: string;
  label: string;
  entity_name: string;
}

// ─── Fetch all spaces ─────────────────────────────────────────────────────────

async function fetchAllTreasuries(): Promise<LabelEntry[]> {
  const entries: LabelEntry[] = [];
  let skip = 0;
  let page = 0;
  let totalSpaces = 0;

  while (true) {
    page++;
    try {
      const raw = await axios.post(
        SNAPSHOT_GRAPHQL,
        {
          query: SPACES_QUERY,
          variables: { first: PAGE_SIZE, skip },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30_000,
        }
      );

      const gql = raw.data as { data?: { spaces?: SnapshotSpace[] }; errors?: unknown[] };
      const spaces = gql?.data?.spaces;

      if (!spaces) {
        if (gql?.errors) {
          console.error('  GraphQL errors:', JSON.stringify(gql.errors).slice(0, 300));
        }
        break;
      }

      totalSpaces += spaces.length;

      for (const space of spaces) {
        if (!space.treasuries?.length) continue;
        const spaceName = space.name ?? space.id;

        for (const treasury of space.treasuries) {
          if (!treasury.address || !treasury.network) continue;
          const chain = CHAIN_MAP[treasury.network];
          if (!chain) continue;  // skip non-EVM or unsupported chains

          const addr = treasury.address.toLowerCase();
          if (!addr.startsWith('0x') || addr.length !== 42) continue;

          const treasuryLabel = treasury.name
            ? `${spaceName} — ${treasury.name}`
            : `${spaceName} Treasury`;

          entries.push({
            address:     addr,
            chain,
            label:       treasuryLabel.slice(0, 120),
            entity_name: spaceName.slice(0, 80),
          });
        }
      }

      process.stdout.write(
        `  Page ${page}: ${totalSpaces} spaces scanned, ${entries.length} treasury addresses…\r`
      );

      if (spaces.length < PAGE_SIZE) break;  // last page
      skip += PAGE_SIZE;
      await sleep(200);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        console.log('\n  Rate limited, waiting 5s…');
        await sleep(5_000);
        continue;
      }
      console.error('\n  Fetch error:', err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log();  // newline after progress
  return entries;
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
      placeholders.push(
        `($${b+1},$${b+2},$${b+3},$${b+4},'dao','medium','snapshot','{"treasury","dao"}')`
      );
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
  console.log(`fetch-snapshot — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Source: Snapshot hub GraphQL\n');

  const entries = await fetchAllTreasuries();

  if (entries.length === 0) {
    console.log('No treasury addresses found');
    await closePool();
    return;
  }

  // Deduplicate by address+chain (keep first occurrence)
  const unique = [...new Map(entries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`Found ${unique.length} unique treasury addresses`);

  // Breakdown by chain
  const byChain: Record<string, number> = {};
  for (const e of unique) byChain[e.chain] = (byChain[e.chain] ?? 0) + 1;
  for (const [c, n] of Object.entries(byChain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(12)} ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.chain.padEnd(10)} ${e.address}  ${e.label.slice(0, 40)}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Inserted ${inserted} Snapshot treasury addresses`);

  try {
    const r = await db.query<{ chain: string; n: string }>(
      `SELECT chain, COUNT(*) AS n FROM entities WHERE source = 'snapshot' GROUP BY chain ORDER BY COUNT(*) DESC`
    );
    console.log('\n── Snapshot entries by chain ────────────────────');
    let total = 0;
    for (const row of r.rows) {
      console.log(`  ${row.chain.padEnd(12)} ${row.n}`);
      total += parseInt(row.n, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
