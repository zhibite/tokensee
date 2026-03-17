/**
 * fetch-ethereum-lists.ts
 *
 * Fetches labeled protocol contracts from:
 *   https://github.com/ethereum-lists/contracts
 *
 * Structure: src/{chainId}/{address}.json
 * Format per file: { name, address, symbol?, website?, support?, ... }
 *
 * Chain IDs mapped:
 *   1   → ethereum
 *   56  → bsc
 *   137 → polygon
 *   42161 → arbitrum
 *   8453  → base
 *   10    → optimism
 *   43114 → avalanche
 *
 * Strategy: Use GitHub API git-tree to get all file paths in one call,
 * then fetch each JSON in rate-limited batches.
 *
 * Usage:
 *   npm run fetch-ethlist
 *   npm run fetch-ethlist -- --dry-run
 *   npm run fetch-ethlist -- --chain=1         (single chain)
 *   npm run fetch-ethlist -- --limit=500       (cap files per chain)
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN   = process.argv.includes('--dry-run');
const CHAIN_ARG = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1];
const LIMIT_ARG = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

const GITHUB_API = 'https://api.github.com/repos/ethereum-lists/contracts';
const GITHUB_RAW = 'https://raw.githubusercontent.com/ethereum-lists/contracts/main';

// Pagination: GitHub Contents API returns max 1000 items per page
// Use /contents/{path} which supports pagination for large directories

// ─── Chain config ─────────────────────────────────────────────────────────────

const CHAIN_MAP: Record<string, string> = {
  '1':     'ethereum',
  '56':    'bsc',
  '137':   'polygon',
  '42161': 'arbitrum',
  '8453':  'base',
  '10':    'optimism',
  '43114': 'avalanche',
};

// ─── Rate limiting ────────────────────────────────────────────────────────────

const DELAY_MS = 120; // gentle GitHub rate limit
const CONCURRENCY = 5;

// GitHub auth: authenticated = 5000 req/h, unauthenticated = 60 req/h
const GITHUB_HEADERS: Record<string, string> = process.env.GITHUB_TOKEN
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  : {};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson<T>(url: string, retries = 1): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get<T>(url, { timeout: 12_000, headers: GITHUB_HEADERS });
      return res.data;
    } catch (err: unknown) {
      // Log rate-limit errors explicitly
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        const remaining = err.response.headers['x-ratelimit-remaining'];
        if (remaining === '0') {
          const reset = err.response.headers['x-ratelimit-reset'];
          const resetDate = reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : 'unknown';
          console.error(`\n  ⚠️  GitHub rate limit hit! Resets at ${resetDate}`);
          console.error('  Set GITHUB_TOKEN in .env to increase limit to 5000 req/h\n');
          return null;
        }
      }
      if (attempt === retries) return null;
      await sleep(500);
    }
  }
  return null;
}

// ─── Get file paths via git tree ──────────────────────────────────────────────

interface TreeItem { path: string; type: string }

async function getFilePaths(chainId: string): Promise<string[]> {
  // Use the Contents API — returns up to 1000 items per page
  // Repo structure: contracts/{chainId}/{address}.json
  const paths: string[] = [];
  let page = 1;

  while (true) {
    const url = `${GITHUB_API}/contents/contracts/${chainId}?per_page=1000&page=${page}`;
    const items = await fetchJson<TreeItem[]>(url);
    if (!items || !Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      if (item.type === 'file' && item.path.endsWith('.json')) {
        paths.push(item.path);
      }
    }

    if (items.length < 1000) break;
    page++;
    await sleep(200);
  }

  return paths;
}

// ─── Process files in batches ─────────────────────────────────────────────────

interface ContractFile {
  name?: string;
  address?: string;
  symbol?: string;
  website?: string;
}

interface LabelEntry {
  address: string; chain: string; label: string; entity_name: string;
}

async function fetchAndParse(filePath: string, chain: string): Promise<LabelEntry | null> {
  const data = await fetchJson<ContractFile>(`${GITHUB_RAW}/${filePath}`);
  if (!data?.name) return null;

  // Address comes from either the file content or the filename
  const filename = filePath.split('/').pop()?.replace('.json', '') ?? '';
  const rawAddr = (data.address ?? filename).toLowerCase();
  if (!rawAddr.startsWith('0x') || rawAddr.length !== 42) return null;

  const symbol = data.symbol ? ` (${data.symbol})` : '';
  const label  = `${data.name}${symbol}`;

  return {
    address:     rawAddr,
    chain,
    label:       label.slice(0, 120),
    entity_name: data.name.slice(0, 80),
  };
}

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += 300) {
    const chunk = entries.slice(i, i + 300);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const b = idx * 5;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},'protocol','medium',$${b+5},'{}')`);
      values.push(e.address, e.chain, e.label, e.entity_name, 'ethereum-lists');
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

// ─── Process one chain ────────────────────────────────────────────────────────

async function processChain(chainId: string, chainName: string): Promise<number> {
  console.log(`\n[chain ${chainId} / ${chainName}] Getting file list…`);
  let paths = await getFilePaths(chainId);
  if (paths.length === 0) {
    console.log(`  No files found`);
    return 0;
  }

  if (LIMIT_ARG > 0) paths = paths.slice(0, LIMIT_ARG);
  console.log(`  ${paths.length} contract files → fetching…`);

  const entries: LabelEntry[] = [];
  let processed = 0;

  // Process in small concurrent batches
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) => fetchAndParse(p, chainName))
    );
    for (const entry of results) {
      if (entry) entries.push(entry);
    }
    processed += batch.length;
    await sleep(DELAY_MS * CONCURRENCY);

    if (processed % 100 === 0) {
      process.stdout.write(`  ${processed}/${paths.length} fetched, ${entries.length} valid…\r`);
    }
  }

  console.log(`\n  Parsed ${entries.length} valid entries`);
  const inserted = await insertBatch(entries);
  console.log(`[chain ${chainId}] ✅ ${inserted} new entries`);
  return inserted;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  try {
    const result = await db.query<{ chain: string; cnt: string }>(
      `SELECT chain, COUNT(*) AS cnt FROM entities WHERE source = 'ethereum-lists'
       GROUP BY chain ORDER BY cnt DESC`
    );
    console.log('\n── ethereum-lists entries ─────────────────────');
    let total = 0;
    for (const row of result.rows) {
      console.log(`  ${row.chain.padEnd(12)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);
  } catch { /* skip */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-ethereum-lists — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT_ARG > 0) console.log(`  (limit: ${LIMIT_ARG} per chain)`);

  const chains = CHAIN_ARG
    ? Object.entries(CHAIN_MAP).filter(([id, name]) => id === CHAIN_ARG || name === CHAIN_ARG)
    : Object.entries(CHAIN_MAP);

  if (chains.length === 0) {
    console.error(`Unknown chain: ${CHAIN_ARG}. Valid IDs: ${Object.keys(CHAIN_MAP).join(', ')}`);
    process.exit(1);
  }

  let grandTotal = 0;
  for (const [chainId, chainName] of chains) {
    grandTotal += await processChain(chainId, chainName);
  }

  console.log(`\n✅ Grand total new entries: ${grandTotal}`);
  if (!DRY_RUN) await printStats();
  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
