/**
 * fetch-arkham.ts
 * Bulk-enrich the entity library via Arkham Intelligence API.
 *
 * Strategy: check addresses in our DB that lack a named entity (entity_name IS NULL
 * or source is low-confidence) against Arkham. When Arkham knows a named entity
 * (e.g. "Binance"), upsert with higher-quality data.
 *
 * Usage:
 *   npm run fetch-arkham              — live run (all un-enriched addresses)
 *   npm run fetch-arkham -- --dry-run — print matches without writing
 *   npm run fetch-arkham -- --limit=1000
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';

const DRY_RUN  = process.argv.includes('--dry-run');
const LIMIT    = (() => { const m = process.argv.join(' ').match(/--limit=(\d+)/); return m ? +m[1] : 0; })();

const ARKHAM_BASE  = 'https://api.arkhamintelligence.com';
const ARKHAM_KEY   = process.env.ARKHAM_API_KEY!;
const CONCURRENCY  = 8;
const DELAY_MS     = 60;   // ~15 req/s — well under the 20 req/s free tier

if (!ARKHAM_KEY) { console.error('ARKHAM_API_KEY not set'); process.exit(1); }

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Type map ────────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  cex: 'exchange', dex: 'protocol', defi: 'protocol', fund: 'fund',
  individual: 'kol', nft: 'nft', bridge: 'bridge', mixer: 'mixer',
  dao: 'dao', oracle: 'oracle', government: 'institution',
  sanctioned: 'sanctioned', hacker: 'hacker', miner: 'miner',
  stablecoin: 'stablecoin',
};

// ─── Load addresses to check ─────────────────────────────────────────────────

async function loadAddresses(): Promise<{ address: string; chain: string }[]> {
  // Priority: addresses with no entity_name, or low-confidence sources
  const LOW_SOURCES = `('alchemy','clustering','onchain','sourcify','import')`;
  let q = `
    SELECT address, chain FROM entities
    WHERE (
      entity_name IS NULL
      OR entity_name = ''
      OR source IN ${LOW_SOURCES}
    )
    AND source != 'arkham'
    ORDER BY created_at DESC
  `;
  if (LIMIT > 0) q += ` LIMIT ${LIMIT}`;
  const { rows } = await db.query(q);
  return rows;
}

// ─── Arkham lookup ───────────────────────────────────────────────────────────

interface ArkhamResult {
  found: boolean;
  entity_name: string | null;
  entity_type: string | null;
  label: string | null;
  chain: string | null;
}

async function lookup(address: string): Promise<ArkhamResult> {
  try {
    const { data } = await axios.get(
      `${ARKHAM_BASE}/intelligence/address/${address.toLowerCase()}`,
      { headers: { 'API-Key': ARKHAM_KEY }, timeout: 8_000 }
    );
    const entity   = data?.arkhamEntity;
    const arkLabel = data?.arkhamLabel?.name ?? entity?.name ?? null;
    const arkType  = entity?.type ?? null;
    if (!entity && !arkLabel) return { found: false, entity_name: null, entity_type: null, label: null, chain: null };
    return {
      found:       true,
      entity_name: entity?.name ?? null,
      entity_type: arkType ? (TYPE_MAP[arkType.toLowerCase()] ?? 'protocol') : 'protocol',
      label:       arkLabel,
      chain:       data?.chain ?? null,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404)
      return { found: false, entity_name: null, entity_type: null, label: null, chain: null };
    return { found: false, entity_name: null, entity_type: null, label: null, chain: null };
  }
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

async function upsert(address: string, chain: string, r: ArkhamResult): Promise<void> {
  await db.query(`
    INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
    VALUES ($1, $2, $3, $4, $5, 'high', 'arkham', '{}')
    ON CONFLICT (address, chain) DO UPDATE SET
      label       = EXCLUDED.label,
      entity_name = EXCLUDED.entity_name,
      entity_type = EXCLUDED.entity_type,
      confidence  = 'high',
      source      = 'arkham',
      updated_at  = NOW()
  `, [address.toLowerCase(), chain, r.label, r.entity_name, r.entity_type]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-arkham — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  const rows = await loadAddresses();
  console.log(`\n  ${rows.length} addresses to check${LIMIT ? ` (limit=${LIMIT})` : ''}\n`);

  let found = 0, updated = 0, i = 0;

  async function processOne(row: { address: string; chain: string }) {
    const r = await lookup(row.address);
    i++;
    if (r.found) {
      found++;
      // Only upsert if Arkham has a named entity (not just a generic label)
      if (r.entity_name) {
        if (!DRY_RUN) await upsert(row.address, row.chain, r);
        else console.log(`  [DRY] ${row.address} (${row.chain}) → ${r.entity_name} / ${r.label} [${r.entity_type}]`);
        updated++;
      }
    }
    if (i % 200 === 0) process.stdout.write(`  ${i}/${rows.length} checked | ${found} found | ${updated} updated\n`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Run with concurrency
  for (let start = 0; start < rows.length; start += CONCURRENCY) {
    await Promise.all(rows.slice(start, start + CONCURRENCY).map(processOne));
  }

  console.log(`\n  Done. ${rows.length} checked | ${found} found by Arkham | ${updated} upserted`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
