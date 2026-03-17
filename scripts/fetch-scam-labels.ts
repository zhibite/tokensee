/**
 * fetch-scam-labels.ts
 *
 * Aggregates known scam/phishing/hack addresses from multiple public sources
 * and imports them as entity_type='hacker', confidence='medium'.
 *
 * Sources (no API keys required):
 *   1. MEW ethereum-lists darklist     — 700+ phishing/scam addresses
 *      https://github.com/MyEtherWallet/ethereum-lists
 *   2. MetaMask eth-phishing-detect    — phishing contract blacklist (address-based entries)
 *      https://github.com/MetaMask/eth-phishing-detect
 *   3. ScamSniffer blacklist           — address-level scammer/drainer contracts
 *      https://github.com/scamsniffer/scam-database
 *
 * Usage:
 *   npm run fetch-scam
 *   npm run fetch-scam -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface ScamEntry {
  address: string;
  chain: string;
  label: string;
  source_tag: string;
}

// ─── Source 1: MEW ethereum-lists darklist ────────────────────────────────────

interface MewEntry { address: string; comment?: string }

async function fetchMewDarklist(): Promise<ScamEntry[]> {
  const url = 'https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json';
  try {
    const res = await axios.get<MewEntry[]>(url, { timeout: 20_000 });
    const entries: ScamEntry[] = [];
    for (const item of res.data ?? []) {
      const addr = item.address?.toLowerCase();
      if (!addr || !addr.startsWith('0x') || addr.length !== 42) continue;
      entries.push({
        address:    addr,
        chain:      'ethereum',
        label:      `Phishing/Scam${item.comment ? ` — ${item.comment.slice(0, 60)}` : ''}`,
        source_tag: 'mew-darklist',
      });
    }
    console.log(`  MEW darklist: ${entries.length} addresses`);
    return entries;
  } catch (err) {
    console.log(`  MEW darklist: fetch failed — ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ─── Source 2: MetaMask phishing detect (address-level blacklist) ─────────────

interface MetaMaskConfig {
  blacklist?: string[];
  fuzzylist?: string[];
  whitelist?: string[];
}

async function fetchMetaMaskPhishing(): Promise<ScamEntry[]> {
  const url = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json';
  try {
    const res = await axios.get<MetaMaskConfig>(url, { timeout: 20_000 });
    const entries: ScamEntry[] = [];
    // blacklist contains domain strings, but some may be 0x addresses
    for (const item of res.data?.blacklist ?? []) {
      const lower = item.toLowerCase().trim();
      if (lower.startsWith('0x') && lower.length === 42) {
        entries.push({
          address:    lower,
          chain:      'ethereum',
          label:      'MetaMask Phishing Blacklist',
          source_tag: 'metamask-phishing',
        });
      }
    }
    console.log(`  MetaMask phishing: ${entries.length} 0x addresses`);
    return entries;
  } catch (err) {
    console.log(`  MetaMask phishing: fetch failed — ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ─── Source 3: ScamSniffer scam-database ─────────────────────────────────────

async function fetchScamSniffer(): Promise<ScamEntry[]> {
  // ScamSniffer publishes blacklisted addresses as JSON files in their repo
  const urls = [
    'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json',
    'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/all.json',
  ];

  const entries: ScamEntry[] = [];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { timeout: 20_000 });
      const data = res.data;

      // Handle array of address strings
      if (Array.isArray(data)) {
        for (const item of data) {
          if (typeof item === 'string') {
            const addr = item.toLowerCase();
            if (addr.startsWith('0x') && addr.length === 42) {
              entries.push({ address: addr, chain: 'ethereum', label: 'ScamSniffer Blacklist', source_tag: 'scamsniffer' });
            }
          } else if (item?.address) {
            const addr = item.address.toLowerCase();
            if (addr.startsWith('0x') && addr.length === 42) {
              entries.push({ address: addr, chain: 'ethereum', label: 'ScamSniffer Blacklist', source_tag: 'scamsniffer' });
            }
          }
        }
      } else if (typeof data === 'object' && data !== null) {
        // Handle object with address keys or nested structure
        for (const val of Object.values(data)) {
          if (typeof val === 'string') {
            const addr = val.toLowerCase();
            if (addr.startsWith('0x') && addr.length === 42) {
              entries.push({ address: addr, chain: 'ethereum', label: 'ScamSniffer Blacklist', source_tag: 'scamsniffer' });
            }
          }
        }
      }

      if (entries.length > 0) break; // Got data from first working URL
    } catch {
      await sleep(500);
    }
  }

  console.log(`  ScamSniffer: ${entries.length} addresses`);
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
      const b = idx * 5;
      const entityName = e.source_tag === 'scamsniffer' ? 'ScamSniffer Blacklist' : 'Phishing/Scam Address';
      placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},'hacker','medium',$${b+5},'{"scam"}')`);
      values.push(e.address, e.chain, e.label, entityName, e.source_tag);
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
  console.log(`fetch-scam-labels — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Sources: MEW darklist + MetaMask phishing + ScamSniffer\n');

  const [mew, metamask, scamsniffer] = await Promise.all([
    fetchMewDarklist(),
    fetchMetaMaskPhishing(),
    fetchScamSniffer(),
  ]);

  const all = [...mew, ...metamask, ...scamsniffer];

  // Deduplicate by address+chain (prefer earlier source)
  const unique = [...new Map(all.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`\nTotal unique scam addresses: ${unique.length}`);

  // Breakdown by source
  const bySource: Record<string, number> = {};
  for (const e of unique) bySource[e.source_tag] = (bySource[e.source_tag] ?? 0) + 1;
  for (const [s, n] of Object.entries(bySource)) console.log(`  ${s.padEnd(20)} ${n}`);

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.address}  ${e.label.slice(0, 50)}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Inserted ${inserted} scam/hacker addresses`);

  try {
    const r = await db.query<{ source: string; cnt: string }>(
      `SELECT source, COUNT(*) AS cnt FROM entities WHERE entity_type = 'hacker' GROUP BY source ORDER BY cnt DESC`
    );
    console.log('\n── Hacker/scam entries by source ────────────────');
    let total = 0;
    for (const row of r.rows) {
      console.log(`  ${row.source.padEnd(20)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(20)} ${total}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
