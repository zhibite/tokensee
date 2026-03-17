/**
 * fetch-forta.ts
 *
 * Fetches on-chain attacker / scammer address labels from Forta Network.
 * https://docs.forta.network/en/latest/api/
 *
 * GraphQL endpoint: https://api.forta.network/graphql
 *
 * Labels fetched (entityType = ADDRESS):
 *   attacker, attacker-eoa, attacker-contract
 *   scammer, scammer-eoa, scammer-contract
 *   phishing-attacker-eoa
 *   contract-exploiter
 *   drainer
 *
 * entity_type: 'hacker', confidence: 'medium', source: 'forta'
 *
 * Optional: set FORTA_API_KEY in .env for higher rate limits
 *
 * Usage:
 *   npm run fetch-forta
 *   npm run fetch-forta -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const FORTA_GRAPHQL = 'https://api.forta.network/graphql';

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(process.env.FORTA_API_KEY ? { Authorization: `Bearer ${process.env.FORTA_API_KEY}` } : {}),
};

// Labels to fetch — map to our entity_type
const TARGET_LABELS = [
  'attacker',
  'attacker-eoa',
  'attacker-contract',
  'scammer',
  'scammer-eoa',
  'scammer-contract',
  'phishing-attacker-eoa',
  'contract-exploiter',
  'drainer',
];

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── GraphQL query ────────────────────────────────────────────────────────────

const LABELS_QUERY = `
  query GetLabels($labels: [String], $after: String) {
    labels(input: {
      labels: $labels
      entityType: ADDRESS
      first: 200
      after: $after
    }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      labels {
        label {
          entity
          entityType
          label
          confidence
        }
      }
    }
  }
`;

interface FortaLabel {
  entity: string;
  entityType: string;
  label: string;
  confidence: number;
}

interface LabelsResponse {
  data?: {
    labels?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      labels: Array<{ label: FortaLabel }>;
    };
  };
  errors?: unknown[];
}

interface ScamEntry {
  address: string;
  chain: string;
  label: string;
}

async function fetchAllLabels(): Promise<ScamEntry[]> {
  const entries: ScamEntry[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    page++;
    try {
      const raw = await axios.post(
        FORTA_GRAPHQL,
        {
          query: LABELS_QUERY,
          variables: { labels: TARGET_LABELS, after: cursor },
        },
        { headers: HEADERS, timeout: 20_000 }
      );
      const gql = raw.data as LabelsResponse;

      const payload = gql?.data?.labels;
      if (!payload) {
        if (gql?.errors) {
          console.error('  GraphQL errors:', JSON.stringify(gql.errors).slice(0, 200));
        }
        break;
      }

      for (const item of payload.labels) {
        const addr = item.label.entity?.toLowerCase();
        if (!addr || !addr.startsWith('0x') || addr.length !== 42) continue;
        entries.push({
          address: addr,
          chain:   'ethereum',  // Forta primarily labels Ethereum addresses
          label:   `Forta: ${item.label.label}`,
        });
      }

      process.stdout.write(`  Page ${page}: ${entries.length} addresses so far…\r`);

      if (!payload.pageInfo.hasNextPage || !payload.pageInfo.endCursor) break;
      cursor = payload.pageInfo.endCursor;
      await sleep(300);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        console.error('\n  ⚠️  Forta API returned 401 — set FORTA_API_KEY in .env');
        break;
      }
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        console.log('\n  Rate limited, waiting 10s…');
        await sleep(10_000);
        continue;
      }
      console.error('\n  Fetch error:', err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(); // newline after progress
  return entries;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertBatch(entries: ScamEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += 300) {
    const chunk = entries.slice(i, i + 300);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const b = idx * 3;
      placeholders.push(
        `($${b+1},$${b+2},$${b+3},'Forta Attacker','hacker','medium','forta','{"security","forta"}')`
      );
      values.push(e.address, e.chain, e.label);
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
  console.log(`fetch-forta — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Source: Forta Network GraphQL (${FORTA_GRAPHQL})`);
  if (!process.env.FORTA_API_KEY) {
    console.log('  ℹ️  No FORTA_API_KEY — using unauthenticated (may be rate-limited)\n');
  }
  console.log(`Labels: ${TARGET_LABELS.join(', ')}\n`);

  const entries = await fetchAllLabels();

  if (entries.length === 0) {
    console.log('No attacker addresses found — API may require auth or labels changed');
    await closePool();
    return;
  }

  // Deduplicate by address+chain (keep unique)
  const unique = [...new Map(entries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`Found ${unique.length} unique attacker addresses`);

  // Breakdown by label type
  const byLabel: Record<string, number> = {};
  for (const e of unique) {
    const lbl = e.label.replace('Forta: ', '');
    byLabel[lbl] = (byLabel[lbl] ?? 0) + 1;
  }
  for (const [l, n] of Object.entries(byLabel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${l.padEnd(28)} ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.address}  ${e.label}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Inserted ${inserted} Forta attacker addresses`);

  try {
    const r = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM entities WHERE source = 'forta'`
    );
    console.log(`   Total forta entries in DB: ${r.rows[0].n}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
