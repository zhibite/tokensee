/**
 * fetch-onchain-scan.ts
 * Bulk-import active Ethereum wallet addresses via Alchemy alchemy_getAssetTransfers.
 *
 * Paginates through external ETH transfers in a given block range,
 * collecting unique from + to addresses and inserting them as entity_type='other'.
 * Addresses already in the entity library (with real labels) are skipped via ON CONFLICT DO NOTHING.
 *
 * Scale estimate (free Alchemy tier, 30M CU/month):
 *   Each page = 1000 transfers = 150 CU → ~200k pages/month → 200M transfers
 *   Unique addresses per scan: typically 2–5M
 *
 * Usage:
 *   npm run fetch-onchain-scan                               — scan recent 500k blocks
 *   npm run fetch-onchain-scan -- --from-block=19000000      — custom start block
 *   npm run fetch-onchain-scan -- --dry-run                  — print first batch only
 *   npm run fetch-onchain-scan -- --reset                    — clear checkpoint, start over
 *   npm run fetch-onchain-scan -- --erc20                    — include ERC-20 transfers too
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
const WITH_ERC20 = process.argv.includes('--erc20');
const FROM_BLOCK_ARG = (() => {
  const m = process.argv.join(' ').match(/--from-block=(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
})();

const CHECKPOINT_FILE = path.join(__dirname, '.onchain-scan-checkpoint.json');
const BATCH_SIZE  = 500;
const PAGE_SIZE   = 1000; // max per Alchemy call
const DELAY_MS    = 100;  // ms between pages

const ALCHEMY_URL = process.env.ALCHEMY_URL
  ?? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Checkpoint ────────────────────────────────────────────────────────────────

interface Checkpoint { pageKey: string | null; totalAddresses: number; totalInserted: number }

function loadCheckpoint(): Checkpoint {
  if (RESET && fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  if (fs.existsSync(CHECKPOINT_FILE)) return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  return { pageKey: null, totalAddresses: 0, totalInserted: 0 };
}

function saveCheckpoint(cp: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}

// ─── Alchemy getAssetTransfers ─────────────────────────────────────────────────

interface AlchemyTransfer {
  from:   string | null;
  to:     string | null;
  value:  number | null;
}

interface AlchemyResponse {
  jsonrpc: string;
  id:      number;
  result: {
    transfers: AlchemyTransfer[];
    pageKey?:  string;
  };
}

async function fetchTransfers(fromBlock: string, toBlock: string, pageKey: string | null): Promise<{
  transfers: AlchemyTransfer[];
  nextPageKey: string | null;
}> {
  const params: Record<string, unknown> = {
    fromBlock,
    toBlock,
    category: WITH_ERC20 ? ['external', 'erc20'] : ['external'],
    excludeZeroValue: true,
    withMetadata: false,
    maxCount: `0x${PAGE_SIZE.toString(16)}`,
  };
  if (pageKey) params.pageKey = pageKey;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await axios.post<AlchemyResponse>(ALCHEMY_URL, {
        jsonrpc: '2.0',
        id:      1,
        method:  'alchemy_getAssetTransfers',
        params:  [params],
      }, { timeout: 30_000 });

      if (res.data.result?.error) {
        throw new Error(JSON.stringify(res.data.result));
      }

      return {
        transfers:   res.data.result.transfers ?? [],
        nextPageKey: res.data.result.pageKey ?? null,
      };
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 429 || status === 503) {
        const wait = 2000 * Math.pow(2, attempt);
        process.stdout.write(`  [rate-limit] waiting ${wait / 1000}s...\n`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Alchemy fetch failed after 5 attempts');
}

// ─── Batch insert ──────────────────────────────────────────────────────────────

async function insertBatch(addresses: string[]): Promise<number> {
  if (addresses.length === 0) return 0;

  // Deduplicate within batch
  const unique = [...new Set(addresses)];
  const placeholders: string[] = [];
  const values: string[] = [];
  let b = 0;

  for (const addr of unique) {
    // label = "Active Wallet", entity_name = addr (42 chars fits in VARCHAR(80))
    placeholders.push(`($${b+1},'ethereum','Active Wallet',$${b+2},'other','low','onchain-scan','{}')`);
    values.push(addr, addr.slice(0, 80));
    b += 2;
  }

  const res = await db.query(
    `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (address, chain) DO NOTHING`,
    values,
  );
  return res.rowCount ?? 0;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY ?? '';
  if (!ALCHEMY_KEY && !process.env.ALCHEMY_URL) {
    console.error('ALCHEMY_API_KEY not set in .env');
    process.exit(1);
  }

  // Determine block range
  // Default: scan last 500k blocks ≈ ~69 days of Ethereum
  let toBlock = 'latest';
  let fromBlockHex: string;

  if (FROM_BLOCK_ARG > 0) {
    fromBlockHex = `0x${FROM_BLOCK_ARG.toString(16)}`;
  } else {
    // Fetch current block number
    const blockRes = await axios.post<{ result: string }>(ALCHEMY_URL, {
      jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [],
    }, { timeout: 10_000 });
    const currentBlock = parseInt(blockRes.data.result, 16);
    const startBlock   = Math.max(0, currentBlock - 500_000);
    fromBlockHex = `0x${startBlock.toString(16)}`;
    console.log(`Scanning blocks ${startBlock.toLocaleString()} → ${currentBlock.toLocaleString()} (~500k blocks)`);
  }

  const cp = loadCheckpoint();
  console.log(`fetch-onchain-scan — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}${RESET ? ' (RESET)' : ''}`);
  console.log(`  Resuming: ${cp.totalAddresses} addresses seen, ${cp.totalInserted} inserted`);
  console.log(`  FROM block: ${fromBlockHex} | ERC-20: ${WITH_ERC20}\n`);

  let pageKey      = cp.pageKey;
  let totalAddrs   = cp.totalAddresses;
  let totalIns     = cp.totalInserted;
  let page         = 0;
  const addrBuffer: string[] = [];

  while (true) {
    let transfers: AlchemyTransfer[];
    let nextPageKey: string | null;

    try {
      ({ transfers, nextPageKey } = await fetchTransfers(fromBlockHex, toBlock, pageKey));
    } catch (e: any) {
      console.error(`\nFetch error: ${e.message}`);
      break;
    }

    if (transfers.length === 0) break;
    page++;

    // Collect unique non-null addresses (skip zero address and contract-like zero-prefix)
    for (const t of transfers) {
      if (t.from && t.from !== '0x0000000000000000000000000000000000000000') {
        addrBuffer.push(t.from.toLowerCase());
      }
      if (t.to && t.to !== '0x0000000000000000000000000000000000000000') {
        addrBuffer.push(t.to.toLowerCase());
      }
    }

    totalAddrs += transfers.length;

    if (DRY_RUN) {
      console.log(`  [DRY] page ${page}: ${transfers.length} transfers → ${addrBuffer.length} addresses buffered`);
      addrBuffer.slice(0, 5).forEach(a => console.log(`    ${a}`));
      if (page >= 2) break;
      pageKey = nextPageKey;
      continue;
    }

    // Flush buffer every BATCH_SIZE
    if (addrBuffer.length >= BATCH_SIZE) {
      const toInsert = addrBuffer.splice(0, BATCH_SIZE);
      totalIns += await insertBatch(toInsert);
      saveCheckpoint({ pageKey: nextPageKey, totalAddresses: totalAddrs, totalInserted: totalIns });
      process.stdout.write(`  page ${page} | ${totalAddrs.toLocaleString()} transfers | ${totalIns.toLocaleString()} new addresses\r`);
    }

    pageKey = nextPageKey;
    if (!pageKey) break;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Flush remaining buffer
  if (!DRY_RUN && addrBuffer.length > 0) {
    for (let i = 0; i < addrBuffer.length; i += BATCH_SIZE) {
      totalIns += await insertBatch(addrBuffer.slice(i, i + BATCH_SIZE));
    }
    saveCheckpoint({ pageKey: null, totalAddresses: totalAddrs, totalInserted: totalIns });
  }

  console.log(`\n\n[Done] ${totalAddrs.toLocaleString()} transfers scanned | ${totalIns.toLocaleString()} new addresses inserted`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
