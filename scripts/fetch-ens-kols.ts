/**
 * fetch-ens-kols.ts
 *
 * Resolves well-known ENS names (KOLs, founders, institutions) to Ethereum
 * addresses via the configured Alchemy RPC, then inserts them into the
 * entity library with entity_type = 'kol' | 'institution' | 'fund'.
 *
 * Uses viem's getEnsAddress — requires ALCHEMY_API_KEY in .env.
 *
 * Usage:
 *   npm run fetch-ens
 *   npm run fetch-ens -- --dry-run
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Build RPC client ──────────────────────────────────────────────────────────

const alchemyKey = process.env.ALCHEMY_API_KEY;
const rpcUrl = alchemyKey
  ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
  : 'https://cloudflare-eth.com'; // public fallback

const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl, { timeout: 10_000 }),
});

// ─── Curated list ─────────────────────────────────────────────────────────────
//
// entity_type: 'kol' | 'institution' | 'fund'
// tags: free-form descriptors

interface KolEntry {
  ens: string;
  name: string;
  entity_type: 'kol' | 'institution' | 'fund';
  tags: string[];
}

const KOL_LIST: KolEntry[] = [
  // ── Ethereum / Protocol Founders ──────────────────────────────────────────
  { ens: 'vitalik.eth',      name: 'Vitalik Buterin',       entity_type: 'kol',         tags: ['ethereum', 'founder'] },
  { ens: 'hayden.eth',       name: 'Hayden Adams',           entity_type: 'kol',         tags: ['uniswap', 'founder', 'defi'] },
  { ens: 'stani.eth',        name: 'Stani Kulechov',         entity_type: 'kol',         tags: ['aave', 'founder', 'defi'] },
  { ens: 'kain.eth',         name: 'Kain Warwick',           entity_type: 'kol',         tags: ['synthetix', 'founder', 'defi'] },
  { ens: 'banteg.eth',       name: 'banteg',                 entity_type: 'kol',         tags: ['yearn', 'developer', 'defi'] },
  { ens: 'lefteris.eth',     name: 'Lefteris Karapetsas',    entity_type: 'kol',         tags: ['rotki', 'developer'] },
  { ens: 'griff.eth',        name: 'Griff Green',            entity_type: 'kol',         tags: ['giveth', 'dao'] },
  { ens: 'dmfj.eth',         name: 'Dan Finlay',             entity_type: 'kol',         tags: ['metamask', 'founder'] },
  { ens: 'ricmoo.eth',       name: 'Richard Moore',          entity_type: 'kol',         tags: ['ethersjs', 'developer'] },
  { ens: 'gakonst.eth',      name: 'Georgios Konstantopoulos', entity_type: 'kol',       tags: ['paradigm', 'developer'] },
  { ens: 'sniko.eth',        name: 'sniko',                  entity_type: 'kol',         tags: ['debank', 'developer'] },
  { ens: 'rleshner.eth',     name: 'Robert Leshner',         entity_type: 'kol',         tags: ['compound', 'founder', 'defi'] },
  { ens: 'samczun.eth',      name: 'samczsun',               entity_type: 'kol',         tags: ['paradigm', 'security', 'researcher'] },
  { ens: 'hasu.eth',         name: 'Hasu',                   entity_type: 'kol',         tags: ['researcher', 'defi', 'mev'] },
  { ens: 'polynya.eth',      name: 'polynya',                entity_type: 'kol',         tags: ['researcher', 'ethereum', 'l2'] },
  { ens: 'pmcgoohan.eth',    name: 'pmcgoohan',              entity_type: 'kol',         tags: ['dark-forest', 'developer'] },

  // ── NFT / Community ────────────────────────────────────────────────────────
  { ens: 'punk6529.eth',     name: 'Punk 6529',              entity_type: 'kol',         tags: ['nft', 'collector', 'advocate'] },
  { ens: 'pranksy.eth',      name: 'Pranksy',                entity_type: 'kol',         tags: ['nft', 'collector'] },
  { ens: 'beanie.eth',       name: 'Beanie',                 entity_type: 'kol',         tags: ['nft', 'collector'] },
  { ens: 'gmoney.eth',       name: 'gmoney',                 entity_type: 'kol',         tags: ['nft', 'collector', 'defi'] },

  // ── Crypto Influencers / Media ─────────────────────────────────────────────
  { ens: 'cobie.eth',        name: 'Cobie',                  entity_type: 'kol',         tags: ['influencer', 'trader'] },
  { ens: 'tetranode.eth',    name: 'Tetranode',              entity_type: 'kol',         tags: ['defi', 'whale', 'trader'] },
  { ens: 'dcfgod.eth',       name: 'DCF GOD',                entity_type: 'kol',         tags: ['trader', 'influencer'] },
  { ens: 'defidad.eth',      name: 'DeFi Dad',               entity_type: 'kol',         tags: ['defi', 'educator'] },

  // ── VC / Funds ─────────────────────────────────────────────────────────────
  { ens: 'paradigm.eth',     name: 'Paradigm',               entity_type: 'fund',        tags: ['vc', 'crypto-native'] },
  { ens: 'dragonfly.eth',    name: 'Dragonfly Capital',      entity_type: 'fund',        tags: ['vc', 'crypto-native'] },
  { ens: 'multicoin.eth',    name: 'Multicoin Capital',      entity_type: 'fund',        tags: ['vc', 'crypto-native'] },
  { ens: 'spartan.eth',      name: 'Spartan Group',          entity_type: 'fund',        tags: ['vc', 'defi'] },

  // ── Institutions / Foundations ─────────────────────────────────────────────
  { ens: 'ethereum.eth',     name: 'Ethereum Foundation',    entity_type: 'institution', tags: ['foundation', 'ethereum'] },
  { ens: 'uniswap.eth',      name: 'Uniswap Labs',           entity_type: 'institution', tags: ['defi', 'protocol'] },
  { ens: 'aave.eth',         name: 'Aave',                   entity_type: 'institution', tags: ['defi', 'protocol'] },
  { ens: 'compound.eth',     name: 'Compound',               entity_type: 'institution', tags: ['defi', 'protocol'] },
  { ens: 'gitcoin.eth',      name: 'Gitcoin',                entity_type: 'institution', tags: ['dao', 'grants'] },
  { ens: 'gnosis.eth',       name: 'Gnosis',                 entity_type: 'institution', tags: ['dao', 'infrastructure'] },
];

// ─── Resolve ENS ──────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function resolveEns(ens: string): Promise<string | null> {
  try {
    const address = await client.getEnsAddress({ name: normalize(ens) });
    return address ?? null;
  } catch {
    return null;
  }
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function upsertEntity(
  address: string,
  entry: KolEntry,
): Promise<boolean> {
  if (DRY_RUN) return true;
  const tags = `{${entry.tags.map((t) => `"${t}"`).join(',')}}`;
  try {
    const res = await db.query(
      `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
       VALUES ($1, 'ethereum', $2, $3, $4, 'high', 'ens', $5::text[])
       ON CONFLICT (address, chain) DO UPDATE
         SET label       = EXCLUDED.label,
             entity_name = EXCLUDED.entity_name,
             entity_type = EXCLUDED.entity_type,
             confidence  = 'high',
             source      = 'ens',
             tags        = EXCLUDED.tags
       WHERE entities.confidence <> 'high' OR entities.source = 'ens'`,
      [address, `${entry.name} (${entry.ens})`, entry.name, entry.entity_type, tags]
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    console.error(`  DB error (${entry.ens}):`, err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-ens-kols — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`RPC: ${alchemyKey ? 'Alchemy' : 'cloudflare-eth (public fallback)'}`);
  console.log(`Resolving ${KOL_LIST.length} ENS names…\n`);

  let resolved = 0;
  let inserted = 0;
  let failed   = 0;

  for (const entry of KOL_LIST) {
    process.stdout.write(`  ${entry.ens.padEnd(22)} `);
    const address = await resolveEns(entry.ens);
    await sleep(120); // gentle rate limit

    if (!address) {
      console.log(`✗ not found`);
      failed++;
      continue;
    }

    resolved++;
    if (DRY_RUN) {
      console.log(`${address}  (dry-run)`);
      continue;
    }

    const ok = await upsertEntity(address, entry);
    if (ok) { inserted++; console.log(`${address}  ✅ ${entry.name}`); }
    else     { console.log(`${address}  — already exists (high-confidence)`); }
  }

  console.log(`\n✅ Resolved ${resolved}/${KOL_LIST.length}, inserted/updated ${inserted}, failed ${failed}`);

  if (!DRY_RUN) {
    try {
      const r = await db.query<{ entity_type: string; cnt: string }>(
        `SELECT entity_type, COUNT(*) AS cnt FROM entities WHERE source = 'ens'
         GROUP BY entity_type ORDER BY cnt DESC`
      );
      console.log('\n── ENS entries in Entity Library ──────────────');
      for (const row of r.rows) {
        console.log(`  ${row.entity_type.padEnd(14)} ${row.cnt}`);
      }
    } catch { /* skip */ }
  }

  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
