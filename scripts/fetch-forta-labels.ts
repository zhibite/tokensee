/**
 * fetch-forta-labels.ts
 *
 * Fetches attacker/hacker/phishing address labels from the public
 * Forta labelled-datasets GitHub repository (no API key required).
 *
 * https://github.com/forta-network/labelled-datasets
 *
 * Per-chain CSV files:
 *   etherscan_malicious_labels.csv  — columns: banned_address, wallet_tag, data_source
 *   malicious_smart_contracts.csv   — columns: contract_address, contract_tag, ...
 *   phishing_scams.csv              — columns: address, etherscan_tag, etherscan_labels, is_contract
 *
 * entity_type : 'hacker'
 * confidence  : 'high'
 * source      : 'forta-github'
 *
 * Usage:
 *   npm run fetch-forta-labels
 *   npm run fetch-forta-labels -- --dry-run
 *   npm run fetch-forta-labels -- --chain=1
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN    = process.argv.includes('--dry-run');
const CHAIN_ARG  = process.argv.find(a => a.startsWith('--chain='))?.split('=')[1];
const BATCH      = 200;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

const CHAIN_ID_MAP: Record<string, string> = {
  '1':     'ethereum',
  '56':    'bsc',
  '137':   'polygon',
  '42161': 'arbitrum',
  '8453':  'base',
  '10':    'optimism',
  '43114': 'avalanche',
};

// CSV files to fetch per chain, with their address column index and label column index
const CSV_FILES: Array<{ file: string; addrCol: number; labelCol: number }> = [
  { file: 'etherscan_malicious_labels.csv', addrCol: 0, labelCol: 1 },
  { file: 'malicious_smart_contracts.csv',  addrCol: 0, labelCol: 1 },
  { file: 'phishing_scams.csv',             addrCol: 0, labelCol: 1 },
];

const RAW_BASE = 'https://raw.githubusercontent.com/forta-network/labelled-datasets/main/labels';

const HEADERS = {
  'User-Agent': 'tokensee-label-fetcher/1.0',
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

interface LabelEntry {
  address: string;
  chain: string;
  label: string;
}

// Simple CSV parser — takes address and label column by index
function parseCsv(text: string, addrCol: number, labelCol: number): Array<{ address: string; label: string }> {
  const lines = text.split('\n').slice(1); // skip header
  const result: Array<{ address: string; label: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Handle quoted fields minimally — just split by comma
    const cols = trimmed.split(',');
    const addr = (cols[addrCol] ?? '').trim().toLowerCase();
    const lbl  = (cols[labelCol] ?? '').trim();
    if (addr.startsWith('0x') && addr.length === 42) {
      result.push({ address: addr, label: lbl });
    }
  }
  return result;
}

async function fetchChain(chainId: string): Promise<LabelEntry[]> {
  const chain = CHAIN_ID_MAP[chainId];
  if (!chain) return [];

  const entries: LabelEntry[] = [];
  const seen = new Set<string>();

  for (const { file, addrCol, labelCol } of CSV_FILES) {
    const url = `${RAW_BASE}/${chainId}/${file}`;
    try {
      const res = await axios.get<string>(url, {
        headers: HEADERS,
        timeout: 30_000,
        responseType: 'text',
      });
      const parsed = parseCsv(res.data, addrCol, labelCol);
      let added = 0;
      for (const { address, label } of parsed) {
        if (!seen.has(address)) {
          seen.add(address);
          entries.push({ address, chain, label });
          added++;
        }
      }
      console.log(`    ${file.padEnd(40)} ${parsed.length} records, ${added} new`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        console.log(`    ${file.padEnd(40)} (not found for chain ${chainId})`);
      } else {
        console.warn(`    ${file.padEnd(40)} FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return entries;
}

async function insertBatch(rows: LabelEntry[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    batch.forEach((e, idx) => {
      const b = idx * 4;
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},'hacker','high','forta-github','{"security","forta"}')`);
      values.push(e.address, e.chain, e.label, e.label || 'Forta Hacker');
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
  console.log(`fetch-forta-labels — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  const targetChains = CHAIN_ARG
    ? [CHAIN_ARG]
    : Object.keys(CHAIN_ID_MAP);

  let totalEntries: LabelEntry[] = [];

  for (const chainId of targetChains) {
    const chainName = CHAIN_ID_MAP[chainId] ?? chainId;
    console.log(`[chain ${chainId} / ${chainName}]`);
    const entries = await fetchChain(chainId);
    console.log(`  → ${entries.length} unique addresses\n`);
    totalEntries = totalEntries.concat(entries);
  }

  // Global dedup (same address may appear in multiple chains, that's fine — different chain key)
  const seen = new Set<string>();
  const deduped: LabelEntry[] = [];
  for (const e of totalEntries) {
    const key = `${e.address}|${e.chain}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(e); }
  }

  // Summary
  const byChain: Record<string, number> = {};
  for (const e of deduped) byChain[e.chain] = (byChain[e.chain] ?? 0) + 1;
  console.log(`Total unique entries: ${deduped.length}`);
  console.log('By chain:', byChain);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:', JSON.stringify(deduped.slice(0, 3), null, 2));
    return;
  }

  console.log('\nInserting into DB…');
  const inserted = await insertBatch(deduped);
  console.log(`Done — inserted ${inserted} new rows (${deduped.length - inserted} already existed)\n`);

  const r = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source = 'forta-github'`,
  );
  console.log(`  forta-github total in DB: ${r.rows[0].cnt}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closePool());
