/**
 * fetch-farcaster.ts
 * Bulk-import Web3 social profiles from Farcaster and Lens Protocol.
 *
 * Sources:
 *   Farcaster — public Hub HTTP API (no key needed)
 *     GET /v1/userDataByFid for each FID + verified addresses
 *   Lens Protocol — public GraphQL API (no key needed)
 *     profiles with owned addresses
 *
 * Usage:
 *   npm run fetch-farcaster              — both sources
 *   npm run fetch-farcaster -- --dry-run
 *   npm run fetch-farcaster -- --source=farcaster
 *   npm run fetch-farcaster -- --source=lens
 *   npm run fetch-farcaster -- --reset
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
const SOURCE_ARG = (() => { const m = process.argv.join(' ').match(/--source=(\S+)/); return m ? m[1] : 'all'; })();

const BATCH_SIZE = 500;

// Public Farcaster hub (Pinata public gateway) — only shard_id=1 has data
const FC_HUB    = 'https://hub.pinata.cloud';
const FC_SHARD  = 1;
// Lens V3 GraphQL
const LENS_API  = 'https://api.lens.xyz/graphql';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function cpPath(src: string) { return path.join(__dirname, `.farcaster-${src}-cp.json`); }
function loadCp(src: string): any {
  if (RESET && fs.existsSync(cpPath(src))) fs.unlinkSync(cpPath(src));
  if (fs.existsSync(cpPath(src))) return JSON.parse(fs.readFileSync(cpPath(src), 'utf8'));
  return null;
}
function saveCp(src: string, data: any) { fs.writeFileSync(cpPath(src), JSON.stringify(data)); }

// ─── Batch insert ─────────────────────────────────────────────────────────────

interface SocialRow { address: string; chain: string; label: string; source: string }

async function insertBatch(rows: SocialRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const placeholders: string[] = [];
  const values: string[] = [];
  let b = 0;
  for (const r of rows) {
    placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+3},'kol','medium',$${b+4},'{"social"}')`);
    values.push(r.address, r.chain, r.label, r.source);
    b += 4;
  }
  const res = await db.query(
    `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (address, chain) DO NOTHING`,
    values
  );
  return res.rowCount ?? 0;
}

// ─── Farcaster ────────────────────────────────────────────────────────────────
// Strategy: paginate all FIDs via /v1/fids, then bulk-fetch user + verified addresses

async function fetchFarcaster(): Promise<number> {
  console.log('\n[Farcaster] Starting...');

  // 1. Get total FID count / list from hub
  let pageToken: string | null = loadCp('farcaster')?.pageToken ?? null;
  let totalProcessed = loadCp('farcaster')?.total ?? 0;
  let inserted = 0;
  let page = 0;

  while (true) {
    let fidsRes: any;
    let fetchOk = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fidsRes = await axios.get(`${FC_HUB}/v1/fids`, {
          params: { pageSize: 1000, shard_id: FC_SHARD, ...(pageToken ? { pageToken } : {}) },
          timeout: 15_000,
        });
        fetchOk = true;
        break;
      } catch (e: any) {
        const status = e.response?.status;
        if (status === 429) {
          const wait = 3000 * Math.pow(2, attempt);
          process.stdout.write(`  [rate-limit] waiting ${wait / 1000}s...\n`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          console.error(`  [Farcaster] fids fetch failed: ${e.message}`);
          break;
        }
      }
    }
    if (!fetchOk) break;

    const fids: number[] = fidsRes.data?.fids ?? [];
    if (fids.length === 0) break;
    page++;

    const rows: SocialRow[] = [];

    // Fetch verified addresses for each FID in parallel (chunks of 20)
    for (let i = 0; i < fids.length; i += 20) {
      const chunk = fids.slice(i, i + 20);
      const results = await Promise.allSettled(chunk.map(async fid => {
        // Get display name (user_data_type=2)
        const userData = await axios.get(`${FC_HUB}/v1/userDataByFid`, {
          params: { fid, user_data_type: 2, shard_id: FC_SHARD },
          timeout: 8_000,
        }).catch(() => null);
        const username = (userData?.data?.messages?.[0]?.data?.userDataBody?.value
          ?? userData?.data?.data?.userDataBody?.value) as string | undefined;

        // Get verified ETH addresses (filter PROTOCOL_ETHEREUM only)
        const verif = await axios.get(`${FC_HUB}/v1/verificationsByFid`, {
          params: { fid, shard_id: FC_SHARD },
          timeout: 8_000,
        }).catch(() => null);
        const addresses: string[] = (verif?.data?.messages ?? [])
          .filter((m: any) => m?.data?.verificationAddAddressBody?.protocol === 'PROTOCOL_ETHEREUM')
          .map((m: any) => m?.data?.verificationAddAddressBody?.address as string)
          .filter((a: any) => typeof a === 'string' && a.startsWith('0x'));

        // filter out PFP URLs stored as display name
        const cleanName = username && !username.startsWith('http') ? username : undefined;
        return { username: cleanName, addresses };
      }));

      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value.username) continue;
        const label = `@${r.value.username}`;
        for (const addr of r.value.addresses) {
          rows.push({ address: addr.toLowerCase(), chain: 'ethereum', label, source: 'farcaster' });
        }
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (DRY_RUN) {
      console.log(`  [DRY] page ${page}: ${fids.length} FIDs → ${rows.length} addresses`);
      rows.slice(0, 5).forEach(r => console.log(`    ${r.address} → ${r.label}`));
      if (page >= 1) break;
    } else {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        inserted += await insertBatch(rows.slice(i, i + BATCH_SIZE));
      }
      totalProcessed += fids.length;
      pageToken = fidsRes.data?.nextPageToken ?? null;
      saveCp('farcaster', { pageToken, total: totalProcessed });
      process.stdout.write(`  page ${page} | ${totalProcessed} FIDs | ${inserted} new addresses\n`);
    }

    if (!fidsRes.data?.nextPageToken) break;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  [Farcaster] Done — ${totalProcessed} FIDs, ${inserted} new`);
  return inserted;
}

// ─── Lens Protocol ────────────────────────────────────────────────────────────

async function fetchLens(): Promise<number> {
  console.log('\n[Lens] Starting...');

  let cursor: string | null = loadCp('lens')?.cursor ?? null;
  let total    = loadCp('lens')?.total ?? 0;
  let inserted = 0;
  let page     = 0;

  while (true) {
    let res: any;
    try {
      res = await axios.post(LENS_API, {
        query: `{
          accounts(request: {
            pageSize: FIFTY,
            ${cursor ? `cursor: "${cursor}",` : ''}
          }) {
            items {
              username { localName }
              address
            }
            pageInfo { next }
          }
        }`,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      });
    } catch (e: any) {
      console.error(`  [Lens] fetch failed: ${e.message}`);
      break;
    }

    if (res.data?.errors) {
      console.error(`  [Lens] GraphQL error: ${JSON.stringify(res.data.errors[0])}`);
      break;
    }

    const profiles = res.data?.data?.accounts?.items ?? [];
    if (profiles.length === 0) break;
    page++;

    const rows: SocialRow[] = profiles
      .filter((p: any) => p.username?.localName && p.address)
      .map((p: any) => ({
        address: p.address.toLowerCase(),
        chain: 'ethereum',
        label: `${p.username.localName}.lens`,
        source: 'lens',
      }));

    if (DRY_RUN) {
      console.log(`  [DRY] page ${page}: ${profiles.length} profiles → ${rows.length} addresses`);
      rows.slice(0, 5).forEach(r => console.log(`    ${r.address} → ${r.label}`));
      if (page >= 1) break;
    } else {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        inserted += await insertBatch(rows.slice(i, i + BATCH_SIZE));
      }
      total += profiles.length;
      cursor = res.data?.data?.accounts?.pageInfo?.next ?? null;
      saveCp('lens', { cursor, total });
      process.stdout.write(`  page ${page} | ${total} profiles | ${inserted} new\n`);
    }

    if (!cursor) break;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  [Lens] Done — ${total} profiles, ${inserted} new`);
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`fetch-farcaster — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}${RESET ? ' (RESET)' : ''}`);

  let total = 0;

  if (SOURCE_ARG === 'all' || SOURCE_ARG === 'farcaster') total += await fetchFarcaster();
  if (SOURCE_ARG === 'all' || SOURCE_ARG === 'lens')      total += await fetchLens();

  console.log(`\n===== Total new: ${total} =====`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
