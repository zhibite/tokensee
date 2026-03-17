/**
 * fetch-goplus.ts
 *
 * Queries addresses against the GoPlus Security Malicious Address API.
 * https://docs.gopluslabs.io/reference/api-overview
 *
 * Strategy:
 *   1. Pull distinct addresses from whale_alerts that are NOT already labeled
 *      as hacker/sanctioned/mixer in entities table.
 *   2. Check each address via GoPlus (concurrently, rate-limited).
 *   3. Insert flagged addresses as entity_type='hacker', source='goplus'.
 *
 * GoPlus auth: SHA1(app_key + time + app_secret) → POST /token → Bearer token
 *
 * Risk fields mapped to tags:
 *   phishing_activities       → phishing
 *   blackmail_activities      → blackmail
 *   stealing_attack           → theft
 *   fake_kyc                  → fake_kyc
 *   malicious_mining_activities → mining_malware
 *   darkweb_transactions      → darkweb
 *   cybercrime                → cybercrime
 *   money_laundering          → money_laundering
 *   financial_crime           → financial_crime
 *   blacklist_doubt           → blacklist
 *   honeypot_related_address  → honeypot
 *
 * Usage:
 *   npm run fetch-goplus
 *   npm run fetch-goplus -- --dry-run
 *   npm run fetch-goplus -- --chain=ethereum --limit=500
 *   npm run fetch-goplus -- --source=whale_alerts   (default)
 *   npm run fetch-goplus -- --source=all_entities   (re-check all known addresses)
 */

import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const CHAIN_ARG  = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1];
const LIMIT_ARG  = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const SOURCE_ARG = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'whale_alerts';

// ─── Config ───────────────────────────────────────────────────────────────────

const APP_KEY    = process.env.GOPLUS_APP_KEY    ?? '';
const APP_SECRET = process.env.GOPLUS_APP_SECRET ?? '';

if (!APP_KEY || !APP_SECRET) {
  console.error('Missing GOPLUS_APP_KEY or GOPLUS_APP_SECRET in .env');
  process.exit(1);
}

const BASE_URL    = 'https://api.gopluslabs.io/api/v1';
const CONCURRENCY = 8;     // parallel requests
const DELAY_MS    = 100;   // ms between batches
const BATCH_SIZE  = 300;   // DB insert batch size

// Our chain name → GoPlus chain_id
const CHAIN_ID_MAP: Record<string, string> = {
  ethereum:  '1',
  bsc:       '56',
  polygon:   '137',
  arbitrum:  '42161',
  base:      '8453',
  optimism:  '10',
  avalanche: '43114',
};

// Risk field → tag name
const RISK_TAGS: Record<string, string> = {
  phishing_activities:        'phishing',
  blackmail_activities:       'blackmail',
  stealing_attack:            'theft',
  fake_kyc:                   'fake_kyc',
  malicious_mining_activities:'mining_malware',
  darkweb_transactions:       'darkweb',
  cybercrime:                 'cybercrime',
  money_laundering:           'money_laundering',
  financial_crime:            'financial_crime',
  blacklist_doubt:            'blacklist',
  honeypot_related_address:   'honeypot',
};

// Risk field → human label prefix
const RISK_LABEL: Record<string, string> = {
  phishing_activities:        'Phishing',
  blackmail_activities:       'Blackmail',
  stealing_attack:            'Theft Attack',
  fake_kyc:                   'Fake KYC',
  malicious_mining_activities:'Mining Malware',
  darkweb_transactions:       'Darkweb',
  cybercrime:                 'Cybercrime',
  money_laundering:           'Money Laundering',
  financial_crime:            'Financial Crime',
  blacklist_doubt:            'Blacklist',
  honeypot_related_address:   'Honeypot',
};

// ─── Auth ────────────────────────────────────────────────────────────────────

interface TokenResult { access_token: string; expires_in: number }
interface GoPlusResp<T> { code: number; message: string; result: T }

async function getAccessToken(): Promise<string> {
  const time = Math.floor(Date.now() / 1000);
  const sign = crypto.createHash('sha1')
    .update(APP_KEY + time + APP_SECRET)
    .digest('hex');

  const res = await axios.post<GoPlusResp<TokenResult>>(
    `${BASE_URL}/token`,
    { app_key: APP_KEY, time, sign },
    { timeout: 10_000 },
  );

  if (res.data.code !== 1) {
    throw new Error(`GoPlus token error: ${res.data.message}`);
  }
  return res.data.result.access_token;
}

// ─── Address check ────────────────────────────────────────────────────────────

interface MaliciousResult {
  blacklist_doubt?:           string;
  phishing_activities?:       string;
  blackmail_activities?:      string;
  stealing_attack?:           string;
  fake_kyc?:                  string;
  malicious_mining_activities?:string;
  darkweb_transactions?:      string;
  cybercrime?:                string;
  money_laundering?:          string;
  financial_crime?:           string;
  honeypot_related_address?:  string;
  contract_address?:          string;
}

interface CheckResult {
  address:    string;
  chain:      string;
  tags:       string[];
  label:      string;
  isMalicious:boolean;
}

async function checkAddress(
  address: string,
  chain: string,
  chainId: string,
  token: string,
): Promise<CheckResult | null> {
  try {
    const res = await axios.get<GoPlusResp<MaliciousResult>>(
      `${BASE_URL}/address_security/${address}?chain_id=${chainId}`,
      {
        headers: { Authorization: token },
        timeout: 8_000,
      },
    );

    if (res.data.code !== 1) return null;

    const r = res.data.result;
    if (!r || Object.keys(r).length === 0) return null; // clean

    // Collect flagged risk tags
    const tags: string[] = [];
    for (const [field, tag] of Object.entries(RISK_TAGS)) {
      if ((r as Record<string, string | undefined>)[field] === '1') {
        tags.push(tag);
      }
    }

    if (tags.length === 0) return null; // no risk flags

    // Build a descriptive label
    const labelParts = tags
      .map((t) => {
        const field = Object.entries(RISK_TAGS).find(([, v]) => v === t)?.[0];
        return field ? RISK_LABEL[field] : t;
      });
    const label = `GoPlus: ${labelParts.join(', ')}`;

    return { address, chain, tags, label, isMalicious: true };
  } catch {
    return null;
  }
}

// ─── Address source queries ───────────────────────────────────────────────────

interface AddrRow { address: string; chain: string }

async function getAddressesFromWhaleAlerts(
  chain: string | undefined,
  limit: number,
): Promise<AddrRow[]> {
  // Pull distinct sender/receiver addresses from whale_alerts
  // that are NOT already flagged as hacker/sanctioned/mixer in entities
  const chainFilter = chain ? `AND chain = '${chain}'` : '';
  const limitClause = limit > 0 ? `LIMIT ${limit}` : 'LIMIT 50000';

  const sql = `
    WITH whale_addrs AS (
      SELECT DISTINCT unnest(ARRAY[from_address, to_address]) AS address, chain
      FROM   whale_alerts
      WHERE  from_address IS NOT NULL AND to_address IS NOT NULL
      ${chainFilter}
    )
    SELECT w.address, w.chain
    FROM   whale_addrs w
    WHERE  NOT EXISTS (
      SELECT 1 FROM entities e
      WHERE  e.address = w.address
        AND  e.chain   = w.chain
        AND  e.entity_type IN ('hacker','sanctioned','mixer')
    )
    ${limitClause}
  `;

  const res = await db.query<AddrRow>(sql);
  return res.rows;
}

async function getAddressesFromAllEntities(
  chain: string | undefined,
  limit: number,
): Promise<AddrRow[]> {
  const chainFilter = chain ? `AND chain = '${chain}'` : '';
  const limitClause = limit > 0 ? `LIMIT ${limit}` : 'LIMIT 100000';

  // Check ALL known addresses not yet verified by GoPlus
  const sql = `
    SELECT address, chain FROM entities
    WHERE  source != 'goplus'
    ${chainFilter}
    ORDER BY created_at DESC
    ${limitClause}
  `;
  const res = await db.query<AddrRow>(sql);
  return res.rows;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertBatch(results: CheckResult[]): Promise<number> {
  if (results.length === 0 || DRY_RUN) return results.length;
  let inserted = 0;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const chunk = results.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((r, idx) => {
      const b = idx * 5;
      const tagArr = `{${r.tags.map((t) => `"${t}"`).join(',')}}`;
      placeholders.push(
        `($${b+1},$${b+2},$${b+3},$${b+3},'hacker','high','goplus','${tagArr}')`,
      );
      values.push(r.address, r.chain, r.label);
    });

    try {
      const res = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO UPDATE
           SET entity_type = 'hacker',
               label       = EXCLUDED.label,
               confidence  = 'high',
               source      = 'goplus',
               tags        = EXCLUDED.tags,
               updated_at  = NOW()`,
        values,
      );
      inserted += res.rowCount ?? 0;
    } catch (err) {
      console.error('  DB error:', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log(`fetch-goplus — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`source: ${SOURCE_ARG}${CHAIN_ARG ? ` | chain: ${CHAIN_ARG}` : ' | all chains'}${LIMIT_ARG ? ` | limit: ${LIMIT_ARG}` : ''}\n`);

  // 1. Get access token
  console.log('Authenticating with GoPlus…');
  const token = await getAccessToken();
  console.log('  Access token obtained.\n');

  // 2. Load addresses
  console.log('Loading addresses to check…');
  let addresses: AddrRow[];
  if (SOURCE_ARG === 'all_entities') {
    addresses = await getAddressesFromAllEntities(CHAIN_ARG, LIMIT_ARG);
  } else {
    addresses = await getAddressesFromWhaleAlerts(CHAIN_ARG, LIMIT_ARG);
  }

  // Filter to supported chains only
  addresses = addresses.filter((a) => CHAIN_ID_MAP[a.chain]);

  console.log(`  ${addresses.length} addresses to check.\n`);

  if (addresses.length === 0) {
    console.log('Nothing to check.');
    return;
  }

  // 3. Check in concurrent batches
  const malicious: CheckResult[] = [];
  let checked = 0;
  let tokenRefreshAt = Date.now() + 60 * 60 * 1000; // refresh every ~1h
  let currentToken   = token;

  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    // Refresh token if close to expiry
    if (Date.now() > tokenRefreshAt) {
      try { currentToken = await getAccessToken(); tokenRefreshAt = Date.now() + 60 * 60 * 1000; }
      catch { /* keep current token */ }
    }

    const batch = addresses.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((a) => checkAddress(a.address, a.chain, CHAIN_ID_MAP[a.chain]!, currentToken)),
    );

    for (const r of results) {
      if (r) malicious.push(r);
    }

    checked += batch.length;
    await sleep(DELAY_MS);

    if (checked % 200 === 0 || checked === addresses.length) {
      process.stdout.write(
        `  ${checked}/${addresses.length} checked | ${malicious.length} flagged\r`,
      );
    }
  }

  console.log(`\n\nResults:`);
  console.log(`  Checked:  ${checked}`);
  console.log(`  Flagged:  ${malicious.length}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] sample:', JSON.stringify(malicious.slice(0, 5), null, 2));
    return;
  }

  // 4. Insert malicious addresses
  if (malicious.length > 0) {
    console.log('\nInserting flagged addresses…');
    const inserted = await insertBatch(malicious);
    console.log(`Done — ${inserted} rows upserted.\n`);
  } else {
    console.log('\nNo new malicious addresses found.');
  }

  // 5. Stats
  const r = await db.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM entities WHERE source = 'goplus'`,
  );
  console.log(`  goplus total in DB: ${r.rows[0].cnt}`);
}

main()
  .catch((err) => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => closePool());
