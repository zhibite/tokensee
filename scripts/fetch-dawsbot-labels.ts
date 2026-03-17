/**
 * fetch-dawsbot-labels.ts
 *
 * Fetches from dawsbot/eth-labels (170k+ labeled Ethereum addresses):
 *   https://github.com/dawsbot/eth-labels
 *
 * Structure: src/mainnet/{category}/all.json
 * Format: [{ "address": "0x...", "nameTag": "Entity: Label" }]
 *
 * Categories mapped to entity_type:
 *   exchange → exchange
 *   phish-hack → hacker
 *   token-contract → token
 *   genesis → institution
 *   defi → protocol
 *   bridge → bridge
 *   miner → miner
 *   nft → nft
 *   stablecoin → stablecoin
 *   funds / fund → fund
 *   institution → institution
 *   oracle → oracle
 *   dao → dao
 *   mixer → mixer
 *
 * Usage:
 *   npm run fetch-dawsbot
 *   npm run fetch-dawsbot -- --dry-run
 *   npm run fetch-dawsbot -- --category=phish-hack
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN      = process.argv.includes('--dry-run');
const CAT_ARG      = process.argv.find((a) => a.startsWith('--category='))?.split('=')[1];
const LIMIT_ARG    = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

const GITHUB_API = 'https://api.github.com/repos/dawsbot/eth-labels/contents';
const GITHUB_RAW = 'https://raw.githubusercontent.com/dawsbot/eth-labels/master';

// ─── Category → entity_type ───────────────────────────────────────────────────

const CATEGORY_TYPE: Record<string, string> = {
  'exchange':       'exchange',
  'phish-hack':     'hacker',
  'token-contract': 'token',
  'genesis':        'institution',
  'defi':           'protocol',
  'bridge':         'bridge',
  'miner':          'miner',
  'nft':            'nft',
  'stablecoin':     'stablecoin',
  'funds':          'fund',
  'fund':           'fund',
  'institution':    'institution',
  'oracle':         'oracle',
  'dao':            'dao',
  'mixer':          'mixer',
  'label-cloud':    'protocol',
};

function categoryToType(cat: string): string {
  return CATEGORY_TYPE[cat.toLowerCase()] ?? 'protocol';
}

// nameTag: "Binance: Hot Wallet" → entity_name = "Binance"
// nameTag: "Phishing" → entity_name = "Phishing"
function parseNameTag(nameTag: string, category: string): { entity_name: string; label: string } {
  const label = String(nameTag).trim();
  const colon = label.indexOf(':');
  const entity_name = colon > 0
    ? label.slice(0, colon).trim()
    : (label.length <= 40 ? label : category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return { entity_name, label };
}

// ─── Rate-limited fetch ────────────────────────────────────────────────────────

const DELAY_MS = 150;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson<T>(url: string, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get<T>(url, { timeout: 15_000 });
      return res.data;
    } catch (err) {
      if (attempt === retries) {
        const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
        console.error(`    fetch failed: ${url.slice(-70)} — ${msg}`);
        return null;
      }
      await sleep(600 * (attempt + 1));
    }
  }
  return null;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

interface LabelEntry {
  address: string; label: string; entity_name: string; entity_type: string;
}

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += 300) {
    const chunk = entries.slice(i, i + 300);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    chunk.forEach((e, idx) => {
      const b = idx * 6;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},'medium',$${b+6},'{}')`);
      values.push(e.address, 'ethereum', e.label, e.entity_name, e.entity_type, 'dawsbot');
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
      console.error('  DB error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Process one category ─────────────────────────────────────────────────────

async function processCategory(category: string): Promise<number> {
  const entityType = categoryToType(category);
  const url = `${GITHUB_RAW}/src/mainnet/${category}/all.json`;

  console.log(`\n[${category}] Fetching all.json (type → ${entityType})…`);
  const data = await fetchJson<Array<{ address: string; nameTag: string }>>(url);
  if (!data || !Array.isArray(data)) {
    console.log(`[${category}] ✗ No data or wrong format`);
    return 0;
  }

  let items = data;
  if (LIMIT_ARG > 0) items = items.slice(0, LIMIT_ARG);
  console.log(`[${category}] ${items.length} entries → processing…`);

  const entries: LabelEntry[] = [];
  for (const row of items) {
    const address = String(row.address ?? '').toLowerCase();
    if (!address.startsWith('0x') || address.length !== 42) continue;
    const { entity_name, label } = parseNameTag(row.nameTag ?? '', category);
    entries.push({ address, label, entity_name, entity_type: entityType });
  }

  const inserted = await insertBatch(entries);
  console.log(`[${category}] ✅ ${entries.length} parsed → ${inserted} new entries`);
  return inserted;
}

// ─── Discover categories ──────────────────────────────────────────────────────

async function listCategories(): Promise<string[]> {
  console.log('Discovering categories from GitHub API…');
  const dirs = await fetchJson<Array<{ name: string; type: string }>>(
    `${GITHUB_API}/src/mainnet`
  );
  if (!dirs) {
    console.warn('Could not list categories — falling back to known list');
    return Object.keys(CATEGORY_TYPE);
  }
  const cats = dirs.filter((d) => d.type === 'dir').map((d) => d.name);
  console.log(`Found ${cats.length} categories: ${cats.join(', ')}`);
  return cats;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  try {
    const result = await db.query<{ entity_type: string; source: string; cnt: string }>(
      `SELECT entity_type, source, COUNT(*) AS cnt FROM entities
       WHERE source = 'dawsbot'
       GROUP BY entity_type, source ORDER BY cnt DESC`
    );
    console.log('\n── Dawsbot entries in Entity Library ──────────────────────');
    let total = 0;
    for (const row of result.rows) {
      console.log(`  ${row.entity_type.padEnd(14)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(14)} ${total}`);
  } catch { /* DB not available */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-dawsbot-labels — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT_ARG > 0) console.log(`  (limit: ${LIMIT_ARG} entries per category)`);

  let categories: string[];
  if (CAT_ARG) {
    categories = [CAT_ARG];
  } else {
    categories = await listCategories();
    await sleep(DELAY_MS);
  }

  let grandTotal = 0;
  for (const cat of categories) {
    grandTotal += await processCategory(cat);
    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Grand total new entries: ${grandTotal}`);
  await printStats();
  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
