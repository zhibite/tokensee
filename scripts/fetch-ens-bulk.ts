/**
 * fetch-ens-bulk.ts
 * Bulk-import ENS domain → address mappings from The Graph ENS subgraph.
 *
 * Paginates through all ENS domains that have a resolved address.
 * Uses cursor-based pagination (id_gt) for reliability at scale.
 * Saves progress to a checkpoint file so it can be resumed after interruption.
 *
 * Usage:
 *   npm run fetch-ens-bulk              — live run (resumes from checkpoint)
 *   npm run fetch-ens-bulk -- --dry-run — print first batch without writing
 *   npm run fetch-ens-bulk -- --reset   — delete checkpoint and start over
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN   = process.argv.includes('--dry-run');
const RESET     = process.argv.includes('--reset');
const LIMIT_ARG = (() => { const m = process.argv.join(' ').match(/--limit=(\d+)/); return m ? +m[1] : 0; })();

const CHECKPOINT_FILE = path.join(__dirname, '.ens-bulk-checkpoint.json');
const PAGE_SIZE   = 1000;
const BATCH_SIZE  = 500;
const DELAY_MS    = 800; // conservative to avoid 429 on hosted service

// The Graph ENS subgraph (hosted service — still active for ENS)
const ENS_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Checkpoint ───────────────────────────────────────────────────────────────

interface Checkpoint { lastId: string; total: number }

function loadCheckpoint(): Checkpoint {
  if (RESET && fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  if (fs.existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  }
  return { lastId: '', total: 0 };
}

function saveCheckpoint(cp: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}

// ─── GraphQL query ────────────────────────────────────────────────────────────

interface Domain {
  id: string;
  name: string;
  resolvedAddress: { id: string } | null;
}

async function fetchPage(afterId: string, retries = 4): Promise<Domain[]> {
  const query = `{
    domains(
      first: ${PAGE_SIZE},
      orderBy: id,
      orderDirection: asc,
      where: {
        resolvedAddress_not: null,
        name_not: null,
        ${afterId ? `id_gt: "${afterId}",` : ''}
      }
    ) {
      id
      name
      resolvedAddress { id }
    }
  }`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.post(
        ENS_SUBGRAPH,
        { query },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
      );
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      return data.data?.domains ?? [];
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < retries) {
        const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
        process.stdout.write(`  [rate-limit] waiting ${wait / 1000}s...\n`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  return [];
}

// ─── Batch insert ─────────────────────────────────────────────────────────────

interface Row { address: string; label: string }

async function insertBatch(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const placeholders: string[] = [];
  const values: string[] = [];
  let b = 0;
  for (const r of rows) {
    const label = r.label.slice(0, 120);
    const name  = r.label.slice(0, 80);
    placeholders.push(`($${b+1},'ethereum',$${b+2},$${b+3},'kol','low','ens-bulk','{"ens"}')`);
    values.push(r.address, label, name);
    b += 3;
  }
  const result = await db.query(
    `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (address, chain) DO NOTHING`,
    values
  );
  return result.rowCount ?? 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-ens-bulk — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}${RESET ? ' (RESET)' : ''}`);

  const cp = loadCheckpoint();
  console.log(`\n  Resuming from id="${cp.lastId || 'start'}" | ${cp.total} already imported\n`);

  let lastId   = cp.lastId;
  let total    = cp.total;
  let inserted = 0;
  let pages    = 0;

  while (true) {
    let domains: Domain[];
    try {
      domains = await fetchPage(lastId);
    } catch (err) {
      console.error('  GraphQL error:', (err as Error).message);
      break;
    }

    if (domains.length === 0) break;
    pages++;

    const rows: Row[] = domains
      .filter(d => d.resolvedAddress && d.name && d.name.endsWith('.eth'))
      .map(d => ({ address: d.resolvedAddress!.id.toLowerCase(), label: d.name }));

    if (DRY_RUN) {
      console.log(`  [DRY] page ${pages}: ${domains.length} domains, ${rows.length} with .eth + address`);
      rows.slice(0, 5).forEach(r => console.log(`    ${r.address} → ${r.label}`));
      if (pages >= 2) break;
    } else {
      // Batch insert in chunks
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        inserted += await insertBatch(rows.slice(i, i + BATCH_SIZE));
      }
      total += rows.length;
      lastId = domains[domains.length - 1].id;
      saveCheckpoint({ lastId, total });
      process.stdout.write(`  page ${pages} | ${total} processed | ${inserted} new\n`);
    }

    if (LIMIT_ARG > 0 && total >= LIMIT_ARG) break;
    if (domains.length < PAGE_SIZE) break;

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n  Done. ${total} processed | ${inserted} newly inserted`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
