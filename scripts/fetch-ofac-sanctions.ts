/**
 * fetch-ofac-sanctions.ts
 *
 * Downloads the OFAC SDN Advanced XML list from US Treasury and extracts
 * EVM-compatible sanctioned addresses.
 *
 * Source: https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/SDN_ADVANCED.XML
 *
 * XML format (sdn_advanced.xml):
 *   <Feature ID="..." FeatureTypeID="345">          ← FeatureTypeID indicates currency
 *     <FeatureVersion ...>
 *       <Comment />
 *       <VersionDetail DetailTypeID="1432">0x...</VersionDetail>
 *     </FeatureVersion>
 *   </Feature>
 *
 * EVM FeatureTypeIDs:
 *   345  = ETH   (Ethereum)
 *   887  = USDT  (ERC-20, Ethereum)
 *   998  = USDC  (ERC-20, Ethereum)
 *   1007 = ARB   (Arbitrum)
 *   1008 = BSC   (Binance Smart Chain)
 *
 * Usage:
 *   npm run fetch-ofac
 *   npm run fetch-ofac -- --dry-run
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

const OFAC_URL = 'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/SDN_ADVANCED.XML';

// FeatureTypeID → chain mapping (EVM-only)
const FEATURE_TYPE_CHAIN: Record<string, { chain: string; symbol: string }> = {
  '345':  { chain: 'ethereum', symbol: 'ETH'  },
  '887':  { chain: 'ethereum', symbol: 'USDT' },
  '998':  { chain: 'ethereum', symbol: 'USDC' },
  '1007': { chain: 'arbitrum', symbol: 'ARB'  },
  '1008': { chain: 'bsc',      symbol: 'BNB'  },
};

const EVM_TYPE_IDS = new Set(Object.keys(FEATURE_TYPE_CHAIN));

// ─── Stream-parse the OFAC XML ────────────────────────────────────────────────

interface SanctionedEntry { address: string; chain: string; symbol: string }

async function downloadAndParse(): Promise<SanctionedEntry[]> {
  console.log('Fetching OFAC SDN Advanced XML (streaming)…');

  let response;
  try {
    response = await axios.get<NodeJS.ReadableStream>(OFAC_URL, {
      responseType: 'stream',
      timeout: 30_000,
      maxRedirects: 5,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to OFAC: ${msg}`);
    return [];
  }

  const entries: SanctionedEntry[] = [];
  let buffer = '';
  let totalBytes = 0;

  // Match:  <Feature ... FeatureTypeID="345" ...>
  const FEATURE_OPEN_RE = /<Feature\s[^>]*FeatureTypeID="(\d+)"[^>]*>/i;
  // Match:  <VersionDetail ...>0x...</VersionDetail>
  const VERSION_RE      = /<VersionDetail[^>]*>(0x[0-9a-fA-F]{40})<\/VersionDetail>/i;
  // Match:  </Feature>
  const FEATURE_CLOSE   = '</Feature>';

  await new Promise<void>((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      buffer += chunk.toString('utf-8');

      // Process all complete <Feature>…</Feature> blocks in the buffer
      let closeIdx: number;
      while ((closeIdx = buffer.indexOf(FEATURE_CLOSE)) !== -1) {
        const block = buffer.slice(0, closeIdx + FEATURE_CLOSE.length);
        buffer = buffer.slice(closeIdx + FEATURE_CLOSE.length);

        // Check if this Feature block is an EVM type
        const typeMatch = FEATURE_OPEN_RE.exec(block);
        if (!typeMatch) continue;
        const typeId = typeMatch[1];
        if (!EVM_TYPE_IDS.has(typeId)) continue;

        // Extract the 0x address
        const addrMatch = VERSION_RE.exec(block);
        if (!addrMatch) continue;

        const address = addrMatch[1].toLowerCase();
        const { chain, symbol } = FEATURE_TYPE_CHAIN[typeId];
        entries.push({ address, chain, symbol });
      }

      // Keep only the tail (incomplete block) — but cap at 16KB to avoid bloat
      if (buffer.length > 16384) {
        // Don't trim if we might be in the middle of a Feature block
        const lastOpen = buffer.lastIndexOf('<Feature ');
        if (lastOpen > 0) {
          buffer = buffer.slice(lastOpen);
        } else {
          buffer = buffer.slice(buffer.length - 4096);
        }
      }

      if (totalBytes % (1024 * 1024) < 8192) {
        process.stdout.write(
          `  ${(totalBytes / 1024 / 1024).toFixed(1)} MB downloaded, ${entries.length} addresses…\r`
        );
      }
    });

    response.data.on('end', resolve);
    response.data.on('error', reject);
  });

  console.log(`\n  Total downloaded: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  return entries;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertBatch(entries: SanctionedEntry[]): Promise<number> {
  if (entries.length === 0 || DRY_RUN) return entries.length;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const b = idx * 4;
      const label = `OFAC Sanctioned (${e.symbol})`;
      placeholders.push(
        `($${b+1},$${b+2},$${b+3},'OFAC Sanctioned','sanctioned','high',$${b+4},'{"sanctions","ofac"}')`
      );
      values.push(e.address, e.chain, label, 'ofac');
    });

    try {
      const res = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO UPDATE
           SET label       = EXCLUDED.label,
               entity_type = 'sanctioned',
               confidence  = 'high',
               source      = 'ofac',
               tags        = EXCLUDED.tags,
               updated_at  = NOW()`,
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
  console.log(`fetch-ofac-sanctions — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Source: US Treasury OFAC SDN Advanced XML\n');

  const entries = await downloadAndParse();

  if (entries.length === 0) {
    console.log('No EVM addresses found — check connectivity or XML format');
    await closePool();
    return;
  }

  const unique = [...new Map(entries.map((e) => [`${e.address}:${e.chain}`, e])).values()];
  console.log(`\nFound ${unique.length} unique EVM sanctioned addresses`);

  // Show breakdown by symbol
  const bySymbol: Record<string, number> = {};
  for (const e of unique) {
    bySymbol[e.symbol] = (bySymbol[e.symbol] ?? 0) + 1;
  }
  for (const [sym, cnt] of Object.entries(bySymbol)) {
    console.log(`  ${sym.padEnd(8)} ${cnt}`);
  }

  if (DRY_RUN) {
    console.log('\n── Sample (dry run) ─────────────────────────────');
    unique.slice(0, 10).forEach((e) =>
      console.log(`  ${e.chain.padEnd(10)} ${e.address}  (${e.symbol})`)
    );
    console.log(`  … (${unique.length} total)`);
    await closePool();
    return;
  }

  const inserted = await insertBatch(unique);
  console.log(`\n✅ Upserted ${inserted} sanctioned addresses`);

  try {
    const r = await db.query<{ chain: string; cnt: string }>(
      `SELECT chain, COUNT(*) AS cnt FROM entities WHERE source = 'ofac' GROUP BY chain ORDER BY cnt DESC`
    );
    console.log('\n── OFAC entries by chain ────────────────────────');
    let total = 0;
    for (const row of r.rows) {
      console.log(`  ${row.chain.padEnd(12)} ${row.cnt}`);
      total += parseInt(row.cnt, 10);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} ${total}`);
  } catch { /* skip */ }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
