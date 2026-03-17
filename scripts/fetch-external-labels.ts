/**
 * fetch-external-labels.ts — P2: pull token/protocol addresses from public APIs
 *
 * Sources:
 *   1. CoinGecko /coins/list?include_platform=true  — ERC-20 tokens across 7 chains
 *   2. DeFiLlama  /protocols                         — DeFi protocol addresses
 *
 * Usage:
 *   npm run fetch-labels
 *   npm run fetch-labels -- --dry-run
 *   npm run fetch-labels -- --source coingecko   (only one source)
 *   npm run fetch-labels -- --source defillama
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE  = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'all';

// ─── Chain Mapping ────────────────────────────────────────────────────────────

/** CoinGecko platform id → our chain name */
const COINGECKO_CHAIN_MAP: Record<string, string> = {
  'ethereum':             'ethereum',
  'arbitrum-one':         'arbitrum',
  'polygon-pos':          'polygon',
  'base':                 'base',
  'optimistic-ethereum':  'optimism',
  'binance-smart-chain':  'bsc',
  'avalanche':            'avalanche',
};

/** DeFiLlama chain name → our chain name */
const DEFILLAMA_CHAIN_MAP: Record<string, string> = {
  'Ethereum':  'ethereum',
  'Arbitrum':  'arbitrum',
  'Polygon':   'polygon',
  'Base':      'base',
  'Optimism':  'optimism',
  'BSC':       'bsc',
  'Avalanche': 'avalanche',
};

// ─── Type helpers ─────────────────────────────────────────────────────────────

const TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/tornado|mixer|blender|cyclone/i,                            'mixer'],
  [/bridge|gateway|relay|portal|wormhole|stargate|hop\b/i,      'bridge'],
  [/usdc|usdt|dai|busd|tusd|frax|lusd|tether|circle|stablecoin/i,'stablecoin'],
  [/chainlink|band\s*protocol|oracle/i,                         'oracle'],
  [/dao|treasury|governance/i,                                  'dao'],
  [/nft|erc721|erc1155|opensea|blur|seaport/i,                  'nft'],
  [/binance|coinbase|okx|kraken|bybit|kucoin|gate\.|bitfinex|htx|huobi|mexc/i, 'exchange'],
];

function guessEntityType(name: string): string {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(name)) return type;
  }
  return 'protocol';
}

// ─── DB insert ────────────────────────────────────────────────────────────────

interface LabelEntry {
  address: string;
  chain: string;
  label: string;
  entity_name: string;
  entity_type: string;
  source: string;
}

async function insertBatch(entries: LabelEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`  [dry-run] would insert ${entries.length} entries`);
    return entries.length;
  }

  let inserted = 0;
  // Insert in chunks of 500 to avoid huge queries
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((e, idx) => {
      const base = idx * 6;
      placeholders.push(
        `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, 'medium', $${base+6}, '{}')`
      );
      values.push(
        e.address.toLowerCase(), e.chain,
        e.label, e.entity_name, e.entity_type, e.source
      );
    });

    try {
      const result = await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (address, chain) DO NOTHING`,
        values
      );
      inserted += result.rowCount ?? 0;
    } catch (err) {
      console.error('  [batch insert error]', err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}

// ─── Source 1: CoinGecko ──────────────────────────────────────────────────────

async function fetchCoinGecko(): Promise<number> {
  console.log('\n[CoinGecko] Fetching coins list...');

  const baseUrl = 'https://api.coingecko.com/api/v3';
  const apiKey  = process.env.COINGECKO_API_KEY ?? '';
  const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

  let coinList: Array<{
    id: string; symbol: string; name: string;
    platforms: Record<string, string>;
  }>;

  try {
    const resp = await axios.get(`${baseUrl}/coins/list`, {
      params: { include_platform: true },
      headers,
      timeout: 20_000,
    });
    coinList = resp.data;
    console.log(`[CoinGecko] Got ${coinList.length} coins`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[CoinGecko] Unavailable — skipping (${msg})`);
    return 0;
  }

  const entries: LabelEntry[] = [];

  for (const coin of coinList) {
    if (!coin.platforms || typeof coin.platforms !== 'object') continue;

    for (const [platform, contractAddr] of Object.entries(coin.platforms)) {
      const chain = COINGECKO_CHAIN_MAP[platform];
      if (!chain) continue;
      if (!contractAddr || !contractAddr.startsWith('0x') || contractAddr.length !== 42) continue;

      const symbol = coin.symbol?.toUpperCase() ?? '';
      const label  = symbol ? `${coin.name} (${symbol})` : coin.name;
      const entity_type = guessEntityType(label);

      entries.push({
        address:     contractAddr.toLowerCase(),
        chain,
        label,
        entity_name: coin.name,
        entity_type,
        source:      'coingecko',
      });
    }
  }

  console.log(`[CoinGecko] Prepared ${entries.length} entries across supported chains`);
  const inserted = await insertBatch(entries);
  console.log(`[CoinGecko] ✅ Inserted ${inserted} new entries`);
  return inserted;
}

// ─── Source 2: DeFiLlama ──────────────────────────────────────────────────────

interface DLProtocol {
  name: string;
  category: string | null;
  address?: string | null;
  chains: string[];
  chainTvls?: Record<string, unknown>;
}

function dlCategoryToEntityType(category: string | null | undefined): string {
  if (!category) return 'protocol';
  const c = category.toLowerCase();
  if (/dex|swap/i.test(c))     return 'protocol';
  if (/bridge/i.test(c))       return 'bridge';
  if (/lending/i.test(c))      return 'protocol';
  if (/stablecoin/i.test(c))   return 'stablecoin';
  if (/yield/i.test(c))        return 'protocol';
  if (/nft/i.test(c))          return 'nft';
  return 'protocol';
}

async function fetchDeFiLlama(): Promise<number> {
  console.log('\n[DeFiLlama] Fetching protocols...');

  let protocols: DLProtocol[];
  try {
    const resp = await axios.get('https://api.llama.fi/protocols', { timeout: 15_000 });
    protocols = resp.data;
    console.log(`[DeFiLlama] Got ${protocols.length} protocols`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[DeFiLlama] Unavailable — skipping (${msg})`);
    return 0;
  }

  const entries: LabelEntry[] = [];

  for (const proto of protocols) {
    if (!proto.name) continue;
    const entity_type = dlCategoryToEntityType(proto.category);

    // Top-level address (usually Ethereum)
    if (proto.address && proto.address.startsWith('0x') && proto.address.length === 42) {
      entries.push({
        address:     proto.address.toLowerCase(),
        chain:       'ethereum',
        label:       proto.name,
        entity_name: proto.name,
        entity_type,
        source:      'defillama',
      });
    }

    // Per-chain addresses from chainTvls
    if (proto.chainTvls && typeof proto.chainTvls === 'object') {
      for (const [dlChain, tvlData] of Object.entries(proto.chainTvls)) {
        const chain = DEFILLAMA_CHAIN_MAP[dlChain];
        if (!chain) continue;

        // chainTvls values are sometimes objects with tvl + address
        if (
          tvlData &&
          typeof tvlData === 'object' &&
          'address' in tvlData &&
          typeof (tvlData as { address?: unknown }).address === 'string'
        ) {
          const addr = (tvlData as { address: string }).address;
          if (addr.startsWith('0x') && addr.length === 42) {
            entries.push({
              address:     addr.toLowerCase(),
              chain,
              label:       `${proto.name} (${dlChain})`,
              entity_name: proto.name,
              entity_type,
              source:      'defillama',
            });
          }
        }
      }
    }
  }

  console.log(`[DeFiLlama] Prepared ${entries.length} entries`);
  const inserted = await insertBatch(entries);
  console.log(`[DeFiLlama] ✅ Inserted ${inserted} new entries`);
  return inserted;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  try {
    const result = await db.query<{ entity_type: string; source: string; cnt: string }>(
      `SELECT entity_type, source, COUNT(*) AS cnt
       FROM entities
       GROUP BY entity_type, source
       ORDER BY entity_type, cnt DESC`
    );
    console.log('\n── Entity Library Stats ──────────────────────────────');
    const total = result.rows.reduce((s, r) => s + parseInt(r.cnt, 10), 0);
    for (const row of result.rows) {
      console.log(`  ${row.entity_type.padEnd(12)} ${row.source.padEnd(12)} ${row.cnt}`);
    }
    console.log(`  ${'TOTAL'.padEnd(25)} ${total}`);
  } catch {
    // DB not available
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`fetch-external-labels — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}, source: ${SOURCE}`);

  let total = 0;

  if (SOURCE === 'all' || SOURCE === 'coingecko') {
    total += await fetchCoinGecko();
  }

  if (SOURCE === 'all' || SOURCE === 'defillama') {
    total += await fetchDeFiLlama();
  }

  console.log(`\n✅ Total new entries: ${total}`);

  await printStats();
  await closePool();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
