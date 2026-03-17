/**
 * enrich-label-quality.ts
 *
 * Improves label quality for defillama-pools entries by:
 *   1. Converting project slugs (e.g. "uniswap-v2") to readable names ("Uniswap V2")
 *   2. Updating entity_name (label stays as slug until enrich-token-meta.ts replaces with real symbol)
 *
 * This is a fast, zero-API-call cleanup pass.
 * Run enrich-token-meta.ts afterward to get real token symbols from on-chain.
 *
 * Usage:
 *   npm run enrich-quality
 *   npm run enrich-quality -- --dry-run
 */

import 'dotenv/config';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

// Words that should stay uppercase
const UPPERCASE_WORDS = new Set(['v1','v2','v3','v4','v5','dao','eth','btc','usd','bnb','dex','cex','amm','lp','nft','defi','ai','api']);
// Words that should stay lowercase
const LOWERCASE_WORDS = new Set(['by','on','of','for','and','the','in','a']);

function slugToName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (UPPERCASE_WORDS.has(lower)) return lower.toUpperCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

async function main() {
  console.log(`enrich-label-quality — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  // Fetch all defillama-pools entries where label = entity_name (slug-style)
  const { rows } = await db.query<{ id: number; label: string; entity_name: string }>(
    `SELECT id, label, entity_name FROM entities
     WHERE source = 'defillama-pools' AND label = entity_name`,
  );

  console.log(`Found ${rows.length} defillama-pools slug entries to clean up`);

  // Build update map: id → new entity_name
  const updates: Array<{ id: number; entity_name: string }> = [];
  const examples: string[] = [];

  for (const row of rows) {
    const newName = slugToName(row.label);
    if (newName !== row.entity_name) {
      updates.push({ id: row.id, entity_name: newName });
      if (examples.length < 10) {
        examples.push(`  "${row.label}" → "${newName}"`);
      }
    }
  }

  console.log(`  ${updates.length} entries will have entity_name updated`);
  console.log('  Examples:');
  examples.forEach((e) => console.log(e));

  if (DRY_RUN) {
    await closePool();
    return;
  }

  // Batch UPDATE using unnest
  if (updates.length === 0) {
    console.log('\nNothing to update.');
    await closePool();
    return;
  }

  const ids = updates.map((u) => u.id);
  const names = updates.map((u) => u.entity_name);

  await db.query(
    `UPDATE entities SET
       entity_name = data.entity_name,
       updated_at  = NOW()
     FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS entity_name) AS data
     WHERE entities.id = data.id`,
    [ids, names],
  );

  console.log(`\nUpdated ${updates.length} entity_name fields.`);

  // Stats
  const after = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source='defillama-pools' AND entity_name != label`,
  );
  console.log(`  defillama-pools entries with improved entity_name: ${after.rows[0].cnt}`);

  await closePool();
}

main().catch((err) => { console.error(err); process.exit(1); });
