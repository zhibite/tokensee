/**
 * fetch-dex-pools.ts
 * Bulk-import DEX liquidity pool addresses from multiple The Graph subgraphs.
 *
 * Sources:
 *   - Uniswap V3 (ETH / ARB / POLYGON / BASE / OP / AVAX / BSC)
 *   - Uniswap V2 (ETH)
 *   - PancakeSwap V3 (BSC)
 *   - Aerodrome (BASE)
 *   - Velodrome (OP)
 *
 * Each pool is labeled as "TOKEN0/TOKEN1 fee%" and stored as entity_type='protocol'.
 *
 * Usage:
 *   npm run fetch-dex-pools              — all subgraphs
 *   npm run fetch-dex-pools -- --dry-run
 *   npm run fetch-dex-pools -- --source=uniswap-v3-eth  — single source
 *   npm run fetch-dex-pools -- --reset                  — clear checkpoints
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN    = process.argv.includes('--dry-run');
const RESET      = process.argv.includes('--reset');
const SOURCE_ARG = (() => { const m = process.argv.join(' ').match(/--source=(\S+)/); return m ? m[1] : ''; })();

const PAGE_SIZE  = 1000;
const BATCH_SIZE = 500;
const DELAY_MS   = 250;

// The Graph decentralized network gateway
// Get a free API key at: https://thegraph.com/studio/ (100k queries/month free)
const THEGRAPH_KEY = process.env.THEGRAPH_API_KEY ?? '';
const GATEWAY      = `https://gateway.thegraph.com/api/${THEGRAPH_KEY}/subgraphs/id`;

// ─── Subgraph registry ────────────────────────────────────────────────────────

interface SubgraphConfig {
  id:     string;
  chain:  string;
  url:    string;
  source: string;
  query:  'uniswap_v3' | 'uniswap_v2';
}

// Subgraph IDs on The Graph decentralized network
const SUBGRAPHS: SubgraphConfig[] = [
  // Uniswap V3 Ethereum
  {
    id: 'uniswap-v3-eth', chain: 'ethereum', source: 'uniswap-v3',
    url: `${GATEWAY}/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
    query: 'uniswap_v3',
  },
  // Uniswap V3 Base
  {
    id: 'uniswap-v3-base', chain: 'base', source: 'uniswap-v3',
    url: `${GATEWAY}/43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG`,
    query: 'uniswap_v3',
  },
  // Uniswap V3 Optimism
  {
    id: 'uniswap-v3-op', chain: 'optimism', source: 'uniswap-v3',
    url: `${GATEWAY}/Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj`,
    query: 'uniswap_v3',
  },
  // Uniswap V2 Ethereum
  {
    id: 'uniswap-v2-eth', chain: 'ethereum', source: 'uniswap-v2',
    url: `${GATEWAY}/EYCKATKGBKLWvSfwvBjzfCBmGwYNdVkduYXVivCsLRFu`,
    query: 'uniswap_v2',
  },
  // PancakeSwap V3 BSC
  {
    id: 'pancake-v3-bsc', chain: 'bsc', source: 'pancakeswap-v3',
    url: `${GATEWAY}/Hv1GncLY5docZoGtXjo4kwbTvxm3MAhVZqBZE4sUT9eZ`,
    query: 'uniswap_v3',
  },
];

// ─── GraphQL queries ──────────────────────────────────────────────────────────

function buildV3Query(afterId: string): string {
  return `{
    pools(
      first: ${PAGE_SIZE},
      orderBy: id,
      orderDirection: asc,
      ${afterId ? `where: { id_gt: "${afterId}" }` : ''}
    ) {
      id
      token0 { symbol }
      token1 { symbol }
      feeTier
    }
  }`;
}

function buildV2Query(afterId: string): string {
  return `{
    pairs(
      first: ${PAGE_SIZE},
      orderBy: id,
      orderDirection: asc,
      ${afterId ? `where: { id_gt: "${afterId}" }` : ''}
    ) {
      id
      token0 { symbol }
      token1 { symbol }
    }
  }`;
}

interface RawPool { id: string; token0: { symbol: string }; token1: { symbol: string }; feeTier?: string }

async function fetchPage(sg: SubgraphConfig, afterId: string): Promise<RawPool[]> {
  const query = sg.query === 'uniswap_v3' ? buildV3Query(afterId) : buildV2Query(afterId);
  const { data } = await axios.post(sg.url, { query }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });
  if (data.errors) throw new Error(JSON.stringify(data.errors[0]));
  return data.data?.pools ?? data.data?.pairs ?? [];
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function cpPath(id: string) { return path.join(__dirname, `.dex-pools-${id}.json`); }
function loadCp(id: string): string {
  if (RESET && fs.existsSync(cpPath(id))) fs.unlinkSync(cpPath(id));
  if (fs.existsSync(cpPath(id))) return JSON.parse(fs.readFileSync(cpPath(id), 'utf8')).lastId;
  return '';
}
function saveCp(id: string, lastId: string) { fs.writeFileSync(cpPath(id), JSON.stringify({ lastId })); }

// ─── Batch insert ─────────────────────────────────────────────────────────────

async function insertBatch(db: pg.Pool, rows: { address: string; chain: string; label: string; source: string }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const placeholders: string[] = [];
  const values: (string)[] = [];
  let b = 0;
  for (const r of rows) {
    const lbl  = r.label.slice(0, 120);
    const name = r.label.slice(0, 80);
    placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},'protocol','low',$${b+5},'{"dex","pool"}')`);
    values.push(r.address, r.chain, lbl, name, r.source);
    b += 5;
  }
  const res = await db.query(
    `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (address, chain) DO NOTHING`,
    values
  );
  return res.rowCount ?? 0;
}

// ─── Process one subgraph ─────────────────────────────────────────────────────

async function processSubgraph(dbPool: pg.Pool, sg: SubgraphConfig): Promise<number> {
  console.log(`\n[${sg.id}] Starting (chain=${sg.chain})`);
  let lastId   = loadCp(sg.id);
  let total    = 0;
  let inserted = 0;
  let pages    = 0;

  while (true) {
    let pools: RawPool[];
    try {
      pools = await fetchPage(sg, lastId);
    } catch (err) {
      console.error(`  [${sg.id}] Error: ${(err as Error).message.slice(0, 120)}`);
      break;
    }
    if (pools.length === 0) break;
    pages++;

    const rows = pools.map(p => {
      const fee = p.feeTier ? ` ${(+p.feeTier / 10000).toFixed(2)}%` : '';
      return {
        address: p.id.toLowerCase(),
        chain: sg.chain,
        label: `${p.token0.symbol}/${p.token1.symbol}${fee}`,
        source: sg.source,
      };
    });

    if (DRY_RUN) {
      console.log(`  [DRY] page ${pages}: ${rows.length} pools`);
      rows.slice(0, 3).forEach(r => console.log(`    ${r.address} → ${r.label} (${r.chain})`));
      if (pages >= 1) break;
    } else {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        inserted += await insertBatch(dbPool, rows.slice(i, i + BATCH_SIZE));
      }
      total += pools.length;
      lastId = pools[pools.length - 1].id;
      saveCp(sg.id, lastId);
      process.stdout.write(`  [${sg.id}] page ${pages} | ${total} processed | ${inserted} new\n`);
    }

    if (pools.length < PAGE_SIZE) break;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`  [${sg.id}] Done — ${total} processed, ${inserted} new`);
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-dex-pools — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}${RESET ? ' (RESET)' : ''}`);
  if (!THEGRAPH_KEY) {
    console.error('\n  ❌  THEGRAPH_API_KEY not set in .env');
    console.error('  Get a free key at https://thegraph.com/studio/ (100k queries/month free)\n');
    process.exit(1);
  }

  const dbPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const targets = SOURCE_ARG
    ? SUBGRAPHS.filter(s => s.id === SOURCE_ARG)
    : SUBGRAPHS;

  if (targets.length === 0) { console.error(`Unknown source: ${SOURCE_ARG}`); process.exit(1); }

  let totalNew = 0;
  for (const sg of targets) {
    totalNew += await processSubgraph(dbPool, sg);
  }

  console.log(`\n===== Total new: ${totalNew} =====`);
  await dbPool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
