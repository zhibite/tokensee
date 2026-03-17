/**
 * fetch-rotki.ts
 *
 * Fetches EVM token metadata from the Rotki assets repository.
 * https://github.com/rotki/assets
 *
 * Strategy:
 *   Downloads databases/v9_global.db (5.4MB SQLite) from the develop branch.
 *   Queries `evm_tokens` joined with `assets` + `common_asset_details` tables.
 *   Filters to our supported chains by EVM chain ID.
 *
 * Chain ID mapping (rotki uses integer chain IDs):
 *   1  = ethereum, 56 = bsc, 137 = polygon, 42161 = arbitrum
 *   8453 = base, 10 = optimism, 43114 = avalanche
 *
 * entity_type: ERC721/ERC1155 → nft, else token
 * confidence: 'medium', source: 'rotki'
 *
 * Usage:
 *   npm run fetch-rotki
 *   npm run fetch-rotki -- --dry-run
 *   npm run fetch-rotki -- --chain=1    (single chain by EVM ID)
 */

import 'dotenv/config';
import axios from 'axios';
import initSqlJs from 'sql.js';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN   = process.argv.includes('--dry-run');
const CHAIN_ARG = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1];

// Rotki integer chain ID → our chain name
const CHAIN_MAP: Record<number, string> = {
  1:     'ethereum',
  56:    'bsc',
  137:   'polygon',
  42161: 'arbitrum',
  8453:  'base',
  10:    'optimism',
  43114: 'avalanche',
};

// v8 and v9 have the same schema; use v8 as primary (more stable download)
const DB_URLS = [
  'https://raw.githubusercontent.com/rotki/assets/develop/databases/v9_global.db',
  'https://raw.githubusercontent.com/rotki/assets/develop/databases/v8_global.db',
];

// ─── Download SQLite DB ───────────────────────────────────────────────────────

async function downloadDb(): Promise<Uint8Array> {
  for (const url of DB_URLS) {
    const version = url.match(/(v\d+_global)/)?.[1] ?? 'db';
    console.log(`Downloading rotki ${version}.db…`);
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 90_000,
        onDownloadProgress: (e: { loaded: number; total?: number }) => {
          if (e.total) {
            process.stdout.write(
              `  ${((e.loaded / e.total) * 100).toFixed(0)}% (${(e.loaded / 1024 / 1024).toFixed(1)} MB)\r`
            );
          }
        },
      });
      console.log('\n  Download complete');
      return new Uint8Array(res.data);
    } catch (err) {
      console.log(`  Failed (${err instanceof Error ? err.message : err}), trying fallback…`);
    }
  }
  throw new Error('All download URLs failed');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelEntry {
  address: string; chain: string; label: string; entity_name: string; entity_type: string;
}

// ─── Parse SQLite DB ──────────────────────────────────────────────────────────

async function parseDb(dbBytes: Uint8Array): Promise<LabelEntry[]> {
  const SQL = await initSqlJs();
  const sqlDb = new SQL.Database(dbBytes);

  // Rotki v9 schema: evm_tokens has (identifier, address, chain, token_kind, decimals, protocol)
  // assets has (identifier, name, type)
  // common_asset_details has (identifier, symbol, ...)
  //
  // Try a few schema variants to handle different versions
  const queries = [
    // v8/v9 schema
    `SELECT et.address, et.chain, et.token_kind,
            a.name, cad.symbol
     FROM evm_tokens et
     LEFT JOIN assets a        ON a.identifier  = et.identifier
     LEFT JOIN common_asset_details cad ON cad.identifier = et.identifier
     WHERE et.address IS NOT NULL AND a.name IS NOT NULL`,

    // Older fallback: assets + evm_tokens joined differently
    `SELECT et.address, et.chain, et.token_kind,
            a.name, a.symbol
     FROM evm_tokens et
     JOIN assets a ON a.identifier = et.identifier
     WHERE et.address IS NOT NULL AND a.name IS NOT NULL`,
  ];

  let rows: unknown[][] = [];
  let columns: string[] = [];

  for (const sql of queries) {
    try {
      const results = sqlDb.exec(sql);
      if (results.length > 0 && results[0].values.length > 0) {
        rows    = results[0].values;
        columns = results[0].columns;
        console.log(`  Schema OK — ${rows.length} rows (columns: ${columns.join(', ')})`);
        break;
      }
    } catch {
      // try next query
    }
  }

  sqlDb.close();

  if (rows.length === 0) {
    console.log('  No rows found — dumping table names for diagnosis:');
    const SQL2 = await initSqlJs();
    const db2 = new SQL2.Database(dbBytes);
    try {
      const tables = db2.exec("SELECT name FROM sqlite_master WHERE type='table'");
      console.log('  Tables:', tables[0]?.values.flat().join(', '));
    } catch { /* ignore */ }
    db2.close();
    return [];
  }

  // Map column index
  const idx = (name: string) => columns.indexOf(name);
  const iAddr    = idx('address');
  const iChain   = idx('chain');
  const iKind    = idx('token_kind');
  const iName    = idx('name');
  const iSymbol  = idx('symbol');

  const entries: LabelEntry[] = [];

  for (const row of rows) {
    const rawAddr = String(row[iAddr] ?? '').toLowerCase();
    if (!rawAddr.startsWith('0x') || rawAddr.length !== 42) continue;

    const chainId  = Number(row[iChain]);
    const ourChain = CHAIN_ARG
      ? (CHAIN_MAP[chainId] === CHAIN_ARG || String(chainId) === CHAIN_ARG ? CHAIN_MAP[chainId] : undefined)
      : CHAIN_MAP[chainId];
    if (!ourChain) continue;

    const name   = String(row[iName] ?? '').trim();
    if (!name) continue;
    const symbol = iSymbol >= 0 && row[iSymbol] ? ` (${row[iSymbol]})` : '';
    const kind   = iKind >= 0 ? String(row[iKind] ?? '').toUpperCase() : 'ERC20';

    entries.push({
      address:     rawAddr,
      chain:       ourChain,
      label:       `${name}${symbol}`.slice(0, 120),
      entity_name: name.slice(0, 80),
      entity_type: (kind === 'ERC721' || kind === 'ERC1155') ? 'nft' : 'token',
    });
  }

  return entries;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

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
      values.push(e.address, e.chain, e.label, e.entity_name, e.entity_type, 'rotki');
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
  console.log(`fetch-rotki — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Source: Rotki assets v9_global.db (SQLite)\n');

  let dbBytes: Uint8Array;
  try {
    dbBytes = await downloadDb();
  } catch (err) {
    console.error('Download failed:', err instanceof Error ? err.message : err);
    await closePool();
    return;
  }

  const entries = await parseDb(dbBytes);
  if (entries.length === 0) {
    console.log('No entries parsed — DB schema may have changed');
    await closePool();
    return;
  }

  // Deduplicate by address+chain
  const unique = [...new Map(entries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`\nFound ${unique.length} unique EVM token entries`);

  // Breakdown by chain
  const byChain: Record<string, number> = {};
  const byType: Record<string, number>  = {};
  for (const e of unique) {
    byChain[e.chain]       = (byChain[e.chain]       ?? 0) + 1;
    byType[e.entity_type]  = (byType[e.entity_type]  ?? 0) + 1;
  }
  console.log('  Chain breakdown:');
  for (const [c, n] of Object.entries(byChain).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c.padEnd(12)} ${n}`);
  }
  console.log('  Type breakdown:');
  for (const [t, n] of Object.entries(byType)) {
    console.log(`    ${t.padEnd(12)} ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n── Sample ───────────────────────────────────────');
    unique.slice(0, 8).forEach((e) =>
      console.log(`  ${e.chain.padEnd(10)} ${e.address}  ${e.label.slice(0, 30)}`)
    );
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Inserted ${inserted} new Rotki token entries`);

  try {
    const r = await db.query<{ chain: string; n: string }>(
      `SELECT chain, COUNT(*) AS n FROM entities WHERE source = 'rotki' GROUP BY chain ORDER BY COUNT(*) DESC`
    );
    console.log('\n── Rotki entries by chain ───────────────────────');
    let total = 0;
    for (const row of r.rows) {
      console.log(`  ${row.chain.padEnd(12)} ${row.n}`);
      total += parseInt(row.n, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
