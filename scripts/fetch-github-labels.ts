/**
 * fetch-github-labels.ts — P2 main data source
 *
 * Fetches from brianleect/etherscan-labels (GitHub public dataset):
 *   - data/etherscan/accounts/  → Ethereum addresses (400+ label files)
 *   - data/arbiscan/accounts/   → Arbitrum addresses
 *   - data/bscscan/accounts/    → BSC addresses
 *   - data/polygonscan/accounts/→ Polygon addresses
 *   - data/optimism/accounts/   → Optimism addresses
 *
 * Data format per JSON file: { "0xAddress": "Label Name" }
 * Filename = entity/protocol name, used to derive entity_type.
 *
 * Usage:
 *   npm run fetch-github
 *   npm run fetch-github -- --dry-run
 *   npm run fetch-github -- --chain=etherscan   (single chain)
 *   npm run fetch-github -- --limit=50          (max files per chain, for testing)
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');
const CHAIN_ARG = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1];
const LIMIT_ARG = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

const GITHUB_RAW  = 'https://raw.githubusercontent.com/brianleect/etherscan-labels/main';
const GITHUB_API  = 'https://api.github.com/repos/brianleect/etherscan-labels/contents';

// ─── Chain configs ────────────────────────────────────────────────────────────

const CHAINS: Array<{ dir: string; chain: string }> = [
  { dir: 'etherscan',   chain: 'ethereum' },
  { dir: 'arbiscan',    chain: 'arbitrum' },
  { dir: 'bscscan',     chain: 'bsc' },
  { dir: 'polygonscan', chain: 'polygon' },
  { dir: 'optimism',    chain: 'optimism' },
  { dir: 'avalanche',   chain: 'avalanche' },
];

// ─── Entity type classifier ───────────────────────────────────────────────────

const TYPE_MAP: Array<[RegExp, string]> = [
  // Exact filename patterns first (high priority)
  [/tornado|mixer|blender|cyclone|typhoon-cash/i,                    'mixer'],
  [/bridge|wormhole|stargate|hop-protocol|synapse|multichain|connext|layer-2|scroll-network|arbitrum-one|optimism|polygon-matic|celer|across|omg-network|rhino-fi/i, 'bridge'],
  [/binance|coinbase|okx|kraken|bybit|kucoin|gate-io|bitfinex|huobi|htx|upbit|bithumb|bitstamp|bittrex|gemini|ftx|crypto-com|poloniex|hitbtc|deribit|bitmart|ascendex|coinlist|liquid|nexo|bitpie|zb-com|korbit|yunbi|topbtc|cobinhood|tidex|changenow|remitano|wirex|bgogo|bitmex|latoken|blockfi|celsius|abcc|digifinex|dinngo/i, 'exchange'],
  [/usdc|usdt|dai|stablecoin|frax|lusd|centre|trusttoken|fei-protocol|empty-set-dollar|mstable|stablecoin/i, 'stablecoin'],
  [/chainlink|oracle|band\b|nest-protocol/i,                         'oracle'],
  [/dao|governance|gitcoin|dxdao|olympusdao|compound-governance|radicle|defi-education-fund/i, 'dao'],
  [/nft|opensea|rarible|looksrare|superrare|nifty|art-blocks|cryptopunks|cryptokitties|decentraland|axie|sorare|gods-unchained|mekaverse|creepz|sudoswap|blur/i, 'nft'],
  [/fund|investment|asset-management|company-funds|alameda|defiance-capital|dragonfly/i, 'fund'],
];

function classifyByFilename(filename: string): string {
  const name = filename.replace(/\.(json|csv)$/, '').toLowerCase();
  for (const [pattern, type] of TYPE_MAP) {
    if (pattern.test(name)) return type;
  }
  return 'protocol';
}

// Entity name from filename: "binance-deposit" → "Binance Deposit"
function labelFromFilename(filename: string): string {
  return filename
    .replace(/\.(json|csv)$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Rate-limited fetch helper ────────────────────────────────────────────────

const DELAY_MS = 200; // stay well under GitHub's 60 req/min unauthenticated
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await axios.get<T>(url, { timeout: 12_000 });
      return resp.data;
    } catch (err) {
      if (attempt === retries) {
        const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
        console.error(`    fetch failed: ${url.slice(-60)} — ${msg}`);
        return null;
      }
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

interface LabelEntry {
  address: string; chain: string; label: string;
  entity_name: string; entity_type: string;
}

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  if (DRY_RUN) return entries.length;

  let inserted = 0;
  for (let i = 0; i < entries.length; i += 300) {
    const chunk = entries.slice(i, i + 300);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const base = idx * 6;
      placeholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},'medium',$${base+6},'{}')`);
      values.push(e.address, e.chain, e.label, e.entity_name, e.entity_type, 'github-labels');
    });

    try {
      const res = await db.query(
        `INSERT INTO entities (address,chain,label,entity_name,entity_type,confidence,source,tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        values
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  DB insert error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Process one chain directory ──────────────────────────────────────────────

async function processChain(dir: string, chain: string): Promise<number> {
  console.log(`\n[${dir}] Listing files...`);

  // Get file list
  const files = await fetchJson<Array<{ name: string; download_url: string | null }>>(
    `${GITHUB_API}/data/${dir}/accounts`
  );
  if (!files) { console.log(`[${dir}] Could not list directory`); return 0; }

  // Only JSON files
  let jsonFiles = files.filter((f) => f.name.endsWith('.json'));
  if (LIMIT_ARG > 0) jsonFiles = jsonFiles.slice(0, LIMIT_ARG);

  console.log(`[${dir}] Found ${jsonFiles.length} JSON files → processing...`);

  let totalInserted = 0;
  let processed = 0;

  for (const file of jsonFiles) {
    const downloadUrl = file.download_url ?? `${GITHUB_RAW}/data/${dir}/accounts/${file.name}`;
    const data = await fetchJson<Record<string, string>>(downloadUrl);
    await sleep(DELAY_MS);

    if (!data || typeof data !== 'object') continue;

    const entityName = labelFromFilename(file.name);
    const entityType = classifyByFilename(file.name);

    const entries: LabelEntry[] = [];
    for (const [rawAddr, label] of Object.entries(data)) {
      const address = rawAddr.toLowerCase();
      if (!address.startsWith('0x') || address.length !== 42) continue;

      entries.push({
        address,
        chain,
        label:       String(label),
        entity_name: entityName,
        entity_type: entityType,
      });
    }

    if (entries.length > 0) {
      const n = await insertBatch(entries);
      totalInserted += n;
    }

    processed++;
    if (processed % 20 === 0) {
      process.stdout.write(`  [${dir}] ${processed}/${jsonFiles.length} files, ${totalInserted} inserted so far\r`);
    }
  }

  console.log(`\n[${dir}] ✅ Done — ${processed} files → ${totalInserted} new entries`);
  return totalInserted;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  try {
    const result = await db.query<{ entity_type: string; source: string; cnt: string }>(
      `SELECT entity_type, source, COUNT(*) AS cnt FROM entities
       GROUP BY entity_type, source ORDER BY cnt DESC`
    );
    console.log('\n── Entity Library Stats ──────────────────────────────────────');
    let total = 0;
    for (const row of result.rows) {
      console.log(`  ${row.entity_type.padEnd(14)} ${row.source.padEnd(22)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(37)} ${total}`);
  } catch { /* DB not available */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-github-labels — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT_ARG > 0) console.log(`  (limit: ${LIMIT_ARG} files per chain for testing)`);

  const chains = CHAIN_ARG
    ? CHAINS.filter((c) => c.dir === CHAIN_ARG || c.chain === CHAIN_ARG)
    : CHAINS;

  if (chains.length === 0) {
    console.error(`Unknown chain: ${CHAIN_ARG}. Valid: ${CHAINS.map((c) => c.dir).join(', ')}`);
    process.exit(1);
  }

  let grandTotal = 0;
  for (const { dir, chain } of chains) {
    grandTotal += await processChain(dir, chain);
  }

  console.log(`\n✅ Grand total new entries: ${grandTotal}`);
  await printStats();
  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
