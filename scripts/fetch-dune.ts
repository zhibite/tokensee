/**
 * fetch-dune.ts
 *
 * Fetches labeled addresses from Dune Analytics `labels.addresses` table.
 * https://docs.dune.com/data-catalog/curated/labels/address-labels
 *
 * Flow:
 *   1. Submit SQL query via Dune API → get execution_id
 *   2. Poll execution status until COMPLETE
 *   3. Fetch paginated results (1000 rows/page)
 *   4. Map Dune label_type → our entity_type
 *   5. INSERT INTO entities ON CONFLICT DO NOTHING
 *
 * Dune label_type → entity_type mapping:
 *   cex                  → exchange
 *   dex / defi / bridge  → protocol / bridge
 *   dao / treasury       → dao
 *   nft                  → nft
 *   hack / exploit       → hacker
 *   mixer / tornado      → mixer
 *   mev                  → hacker (MEV bot)
 *   token                → token
 *   everything else      → protocol
 *
 * Usage:
 *   npm run fetch-dune -- --query-id=<id>            (execute existing saved query)
 *   npm run fetch-dune -- --query-id=<id> --dry-run
 *   npm run fetch-dune -- --chain=ethereum            (build+run query, requires paid plan)
 *   npm run fetch-dune -- --limit=10000
 *
 * How to get a query_id:
 *   1. Go to https://dune.com/queries and create a new query
 *   2. Paste: SELECT address, name, label_type, label_subtype, blockchain
 *             FROM labels.addresses
 *             WHERE blockchain IN ('ethereum','bnb','arbitrum','polygon','base','optimism','avalanche')
 *               AND address LIKE '0x%' AND LENGTH(address) = 42
 *   3. Save the query — the URL becomes dune.com/queries/<query_id>
 *   4. Run: npm run fetch-dune -- --query-id=<query_id>
 */

import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const CHAIN_ARG  = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1];
const LIMIT_ARG  = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const QUERY_ID   = parseInt(process.argv.find((a) => a.startsWith('--query-id='))?.split('=')[1] ?? '0', 10);

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEY  = process.env.DUNE_API_KEY ?? '';
const BASE_URL = 'https://api.dune.com/api/v1';

if (!API_KEY) {
  console.error('Missing DUNE_API_KEY in .env');
  process.exit(1);
}

const HEADERS = { 'x-dune-api-key': API_KEY };

// Dune blockchain name → our chain name
const CHAIN_MAP: Record<string, string> = {
  ethereum:  'ethereum',
  bnb:       'bsc',
  arbitrum:  'arbitrum',
  polygon:   'polygon',
  base:      'base',
  optimism:  'optimism',
  avalanche: 'avalanche',
};

const SUPPORTED_DUNE_CHAINS = Object.keys(CHAIN_MAP);

// Dune label_type → our entity_type
function labelTypeToEntityType(labelType: string, labelSubtype: string, name: string): string {
  const t = (labelType ?? '').toLowerCase();
  const s = (labelSubtype ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();

  if (t === 'cex' || s === 'cex') return 'exchange';
  if (t === 'dex') return 'protocol';
  if (t === 'bridge' || s.includes('bridge')) return 'bridge';
  if (t === 'mixer' || n.includes('tornado') || n.includes('mixer')) return 'mixer';
  if (t === 'hack' || t === 'exploit' || s.includes('hack') || s.includes('exploit')) return 'hacker';
  if (t === 'dao' || s === 'dao' || s.includes('treasury') || s.includes('governance')) return 'dao';
  if (t === 'nft' || s === 'nft') return 'nft';
  if (t === 'mev') return 'hacker'; // MEV bot — tag with hacker for tracking
  if (t === 'token' || s === 'token') return 'token';
  if (t === 'defi' || t === 'project' || s === 'protocol') return 'protocol';
  return 'protocol';
}

function labelTypeToConfidence(labelType: string): string {
  const t = (labelType ?? '').toLowerCase();
  if (t === 'hack' || t === 'exploit') return 'high';
  if (t === 'cex' || t === 'bridge' || t === 'mixer') return 'high';
  return 'medium';
}

// ─── Dune API ─────────────────────────────────────────────────────────────────

interface DuneExecuteResponse { execution_id: string }
interface DuneStatusResponse  { state: string; error?: string }
interface DuneRow {
  address:       string;
  name:          string;
  label_type:    string;
  label_subtype: string;
  blockchain:    string;
  category?:     string;
}
interface DuneResultsResponse {
  result: {
    rows:     DuneRow[];
    metadata: { total_row_count: number };
  };
  next_offset?: number;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function createAndExecuteQuery(sql: string): Promise<{ executionId: string; queryId: number }> {
  // Step 1: Create a new query
  interface DuneCreateResponse { query_id: number }
  const createRes = await axios.post<DuneCreateResponse>(
    `${BASE_URL}/query`,
    { name: 'tokensee-labels', query_sql: sql, is_private: true },
    { headers: HEADERS, timeout: 30_000 },
  );
  const queryId = createRes.data.query_id;
  console.log(`  query_id: ${queryId}`);

  // Step 2: Execute the created query
  const execRes = await axios.post<DuneExecuteResponse>(
    `${BASE_URL}/query/${queryId}/execute`,
    { performance: 'medium' },
    { headers: HEADERS, timeout: 30_000 },
  );
  return { executionId: execRes.data.execution_id, queryId };
}

async function archiveQuery(queryId: number): Promise<void> {
  try {
    await axios.delete(`${BASE_URL}/query/${queryId}`, { headers: HEADERS, timeout: 10_000 });
  } catch { /* ignore */ }
}

async function waitForExecution(executionId: string): Promise<void> {
  const MAX_WAIT = 600_000; // 10 minutes
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    await sleep(5_000);
    const res = await axios.get<DuneStatusResponse>(
      `${BASE_URL}/execution/${executionId}/status`,
      { headers: HEADERS, timeout: 15_000 },
    );
    const { state, error } = res.data;

    process.stdout.write(`  status: ${state}\r`);

    if (state === 'QUERY_STATE_COMPLETED') {
      console.log('\n  Query completed.');
      return;
    }
    if (state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${error ?? 'unknown error'}`);
    }
    if (state === 'QUERY_STATE_CANCELLED') {
      throw new Error('Dune query was cancelled');
    }
  }
  throw new Error('Dune query timed out after 10 minutes');
}

async function fetchPage(executionId: string, offset: number, limit = 1000): Promise<DuneResultsResponse> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await axios.get<DuneResultsResponse>(
        `${BASE_URL}/execution/${executionId}/results`,
        { headers: HEADERS, params: { offset, limit }, timeout: 30_000 },
      );
      return res.data;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 429) {
        const wait = 5000 * Math.pow(2, attempt); // 5s, 10s, 20s, 40s…
        process.stdout.write(`\n  [rate-limit] waiting ${wait / 1000}s...\n`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error('fetchPage failed after 8 attempts');
}

// ─── DB insert ────────────────────────────────────────────────────────────────

interface EntityRow {
  address:     string;
  chain:       string;
  label:       string;
  entity_type: string;
  confidence:  string;
}

async function insertBatch(rows: EntityRow[]): Promise<number> {
  if (rows.length === 0 || DRY_RUN) return rows.length;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((r, idx) => {
      const b = idx * 5;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+3},$${b+4},$${b+5},'dune','{}')`);
      values.push(r.address, r.chain, r.label, r.entity_type, r.confidence);
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
  console.log(`fetch-dune — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  // Build chain filter
  const chainsToQuery = CHAIN_ARG
    ? SUPPORTED_DUNE_CHAINS.filter((c) => c === CHAIN_ARG || CHAIN_MAP[c] === CHAIN_ARG)
    : SUPPORTED_DUNE_CHAINS;

  if (chainsToQuery.length === 0) {
    console.error(`Unknown chain: ${CHAIN_ARG}`);
    process.exit(1);
  }

  const chainList = chainsToQuery.map((c) => `'${c}'`).join(', ');
  const limitClause = LIMIT_ARG > 0 ? `LIMIT ${LIMIT_ARG}` : '';

  console.log(`  chains: ${chainsToQuery.join(', ')}\n`);

  // SQL query against labels.addresses
  const sql = `
    SELECT
      address,
      name,
      label_type,
      label_subtype,
      blockchain
    FROM labels.addresses
    WHERE blockchain IN (${chainList})
      AND address LIKE '0x%'
      AND LENGTH(address) = 42
      AND name IS NOT NULL
      AND name != ''
    ${limitClause}
  `.trim();

  // 1. Create query + execute (or use provided query_id)
  console.log('Submitting query to Dune…');
  let executionId: string;
  let queryId: number;
  let createdQuery = false;
  try {
    if (QUERY_ID > 0) {
      // Use existing saved query (works on free plan)
      queryId = QUERY_ID;
      console.log(`  using existing query_id: ${queryId}`);
      const execRes = await axios.post<DuneExecuteResponse>(
        `${BASE_URL}/query/${queryId}/execute`,
        { performance: 'medium' },
        { headers: HEADERS, timeout: 30_000 },
      );
      executionId = execRes.data.execution_id;
    } else {
      // Create a new query (requires paid plan)
      ({ executionId, queryId } = await createAndExecuteQuery(sql));
      createdQuery = true;
    }
    console.log(`  execution_id: ${executionId}`);
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const msg    = (err.response?.data as { error?: string })?.error ?? '';
      console.error(`  API error ${status}: ${msg}`);
      if (status === 403) {
        console.error('\n  ⚠️  Creating queries requires a paid Dune plan.');
        console.error('  Create the query manually at https://dune.com/queries, then:');
        console.error('  npm run fetch-dune -- --query-id=<id>\n');
      }
    } else {
      console.error('  Error:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }

  // 2. Wait for completion
  console.log('\nWaiting for query to complete…');
  await waitForExecution(executionId);

  // 3. Fetch total count
  const firstPage = await fetchPage(executionId, 0, 1);
  const total = firstPage.result.metadata.total_row_count;
  console.log(`  Total rows: ${total.toLocaleString()}\n`);

  // 4. Paginate and insert
  const PAGE_SIZE  = 1000;
  const PAGE_DELAY = 500; // ms between pages — avoid Dune rate limit
  let offset       = 0;
  let totalInserted = 0;
  let totalSkipped  = 0;

  while (offset < total) {
    const page    = await fetchPage(executionId, offset, PAGE_SIZE);
    const rows    = page.result.rows;
    if (rows.length === 0) break;

    const entityRows: EntityRow[] = [];
    for (const r of rows) {
      const addr = (r.address ?? '').toLowerCase();
      if (!addr.startsWith('0x') || addr.length !== 42) { totalSkipped++; continue; }

      const chain = CHAIN_MAP[r.blockchain];
      if (!chain) { totalSkipped++; continue; }

      entityRows.push({
        address:     addr,
        chain,
        label:       (r.name ?? '').slice(0, 120),
        entity_type: labelTypeToEntityType(r.label_type, r.label_subtype, r.name),
        confidence:  labelTypeToConfidence(r.label_type),
      });
    }

    const inserted = await insertBatch(entityRows);
    totalInserted += inserted;
    offset        += rows.length;

    await sleep(PAGE_DELAY);
    process.stdout.write(
      `  ${offset}/${total} fetched | ${totalInserted} new inserted\r`,
    );
  }

  // Cleanup: archive the temporary query (only if we created it)
  if (createdQuery) await archiveQuery(queryId);

  console.log(`\n\nResults:`);
  console.log(`  Total rows:   ${total.toLocaleString()}`);
  console.log(`  New inserted: ${totalInserted.toLocaleString()}`);
  console.log(`  Skipped:      ${totalSkipped.toLocaleString()}`);

  if (DRY_RUN) return;

  // 5. Stats by chain
  const r = await db.query<{ chain: string; cnt: string }>(
    `SELECT chain, COUNT(*) AS cnt FROM entities WHERE source = 'dune'
     GROUP BY chain ORDER BY cnt DESC`,
  );
  console.log('\n── dune labels in DB ──────────────────────');
  let dbTotal = 0;
  for (const row of r.rows) {
    console.log(`  ${row.chain.padEnd(12)} ${row.cnt}`);
    dbTotal += parseInt(row.cnt, 10);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${dbTotal}`);
}

main()
  .catch((err) => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => closePool());
