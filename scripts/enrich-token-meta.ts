/**
 * enrich-token-meta.ts
 *
 * Enriches token entries with real name/symbol by calling ERC-20 contracts on-chain.
 * Targets entries where label = entity_name (slug-style, no real token name).
 *
 * Strategy per chain:
 *   ethereum  — Alchemy alchemy_getTokenMetadata (fast batch API)
 *   others    — viem direct ERC-20 symbol()/name() calls (concurrent batches)
 *
 * Updates:
 *   label       ← token symbol (e.g. "USDC")
 *   entity_name ← token name   (e.g. "USD Coin")
 *
 * Only updates if both name AND symbol are returned and non-empty.
 *
 * Usage:
 *   npm run enrich-token-meta
 *   npm run enrich-token-meta -- --dry-run
 *   npm run enrich-token-meta -- --chain=ethereum
 *   npm run enrich-token-meta -- --source=defillama-pools   (default)
 *   npm run enrich-token-meta -- --source=all               (all token-type entries with slug labels)
 */

import 'dotenv/config';
import axios from 'axios';
import { createPublicClient, http, parseAbi } from 'viem';
import * as viemChains from 'viem/chains';
import pg from 'pg';

const DRY_RUN     = process.argv.includes('--dry-run');
const CHAIN_ARG   = (() => { const m = process.argv.join(' ').match(/--chain=(\w+)/); return m ? m[1] : 'all'; })();
const SOURCE_ARG  = (() => { const m = process.argv.join(' ').match(/--source=([\w-]+)/); return m ? m[1] : 'defillama-pools'; })();

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY ?? '';
const DB_URL      = process.env.DATABASE_URL!;
const pool        = new pg.Pool({ connectionString: DB_URL });

const BATCH_SIZE  = 20;   // concurrent viem calls
const ALCHEMY_BATCH = 50; // alchemy_getTokenMetadata per request (1 call each, but throttle)
const DELAY_MS    = 150;

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

// ─── Chain RPC configs ────────────────────────────────────────────────────────

const CHAIN_RPC: Record<string, { rpc: string; viemChain: Parameters<typeof createPublicClient>[0]['chain'] }> = {
  ethereum:  { rpc: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,      viemChain: viemChains.mainnet },
  bsc:       { rpc: process.env.QUICKNODE_BSC_URL ?? 'https://bsc-dataseed.binance.org', viemChain: viemChains.bsc },
  arbitrum:  { rpc: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,      viemChain: viemChains.arbitrum },
  polygon:   { rpc: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,  viemChain: viemChains.polygon },
  base:      { rpc: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,     viemChain: viemChains.base },
  optimism:  { rpc: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,      viemChain: viemChains.optimism },
  avalanche: { rpc: `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,     viemChain: viemChains.avalanche },
};

// ─── Alchemy Token Metadata (ETH mainnet — 1 req per address) ─────────────────

async function alchemyTokenMeta(addresses: string[]): Promise<Map<string, { symbol: string; name: string }>> {
  const result = new Map<string, { symbol: string; name: string }>();
  const url = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

  // Alchemy doesn't support true batch for alchemy_getTokenMetadata (one address per call)
  // Send them concurrently in groups of BATCH_SIZE
  for (let i = 0; i < addresses.length; i += ALCHEMY_BATCH) {
    const chunk = addresses.slice(i, i + ALCHEMY_BATCH);
    const promises = chunk.map(async (addr) => {
      try {
        const res = await axios.post(url, {
          id: 1, jsonrpc: '2.0',
          method: 'alchemy_getTokenMetadata',
          params: [addr],
        }, { timeout: 10_000 });
        const r = res.data?.result;
        if (r?.symbol && r?.name && r.symbol !== 'unknown' && r.name !== 'unknown') {
          result.set(addr, { symbol: r.symbol, name: r.name });
        }
      } catch { /* skip */ }
    });
    await Promise.all(promises);
    if (i + ALCHEMY_BATCH < addresses.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  return result;
}

// ─── viem ERC-20 calls (non-ETH chains) ──────────────────────────────────────

async function viemTokenMeta(
  addresses: string[],
  chain: string,
): Promise<Map<string, { symbol: string; name: string }>> {
  const result = new Map<string, { symbol: string; name: string }>();
  const cfg = CHAIN_RPC[chain];
  if (!cfg) return result;

  const client = createPublicClient({ chain: cfg.viemChain, transport: http(cfg.rpc) });

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const chunk = addresses.slice(i, i + BATCH_SIZE);
    const promises = chunk.map(async (addr) => {
      try {
        const [symbol, name] = await Promise.all([
          client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
          client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'name'   }),
        ]);
        if (symbol && name && typeof symbol === 'string' && typeof name === 'string') {
          result.set(addr, { symbol: symbol.slice(0, 30), name: name.slice(0, 80) });
        }
      } catch { /* not an ERC-20 or call failed */ }
    });
    await Promise.all(promises);
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  return result;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function fetchTargets(chain: string, source: string): Promise<Array<{ id: number; address: string; chain: string }>> {
  const chainClause = chain === 'all' ? '' : `AND chain = $1`;
  const chainParam  = chain === 'all' ? [] : [chain];
  const sourceClause = source === 'all'
    ? `AND entity_type IN ('token', 'stablecoin')`
    : `AND source = '${source}'`;

  const { rows } = await pool.query<{ id: number; address: string; chain: string }>(
    `SELECT id, address, chain FROM entities
     WHERE label = lower(label)  -- slug-style: all-lowercase means not a real token symbol
       ${sourceClause}
       ${chainClause}
     ORDER BY chain, address`,
    chainParam,
  );
  return rows;
}

async function batchUpdate(updates: Array<{ id: number; symbol: string; name: string }>): Promise<number> {
  if (updates.length === 0) return 0;
  const ids    = updates.map((u) => u.id);
  const labels = updates.map((u) => u.symbol.slice(0, 120));
  const names  = updates.map((u) => u.name.slice(0, 80));

  await pool.query(
    `UPDATE entities SET
       label       = data.label,
       entity_name = data.name,
       updated_at  = NOW()
     FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS label, UNNEST($3::text[]) AS name) AS data
     WHERE entities.id = data.id`,
    [ids, labels, names],
  );
  return updates.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`enrich-token-meta — mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | chain: ${CHAIN_ARG} | source: ${SOURCE_ARG}\n`);

  const targets = await fetchTargets(CHAIN_ARG, SOURCE_ARG);
  console.log(`Found ${targets.length} entries to enrich`);

  // Group by chain
  const byChain = new Map<string, Array<{ id: number; address: string }>>();
  for (const t of targets) {
    if (!byChain.has(t.chain)) byChain.set(t.chain, []);
    byChain.get(t.chain)!.push({ id: t.id, address: t.address });
  }

  for (const [chain, entries] of byChain) {
    console.log(`\n[${chain}] ${entries.length} addresses`);
    const addresses = entries.map((e) => e.address);

    // Fetch token metadata
    let metaMap: Map<string, { symbol: string; name: string }>;
    if (chain === 'ethereum' && ALCHEMY_KEY) {
      console.log(`  Using Alchemy alchemy_getTokenMetadata…`);
      metaMap = await alchemyTokenMeta(addresses);
    } else {
      console.log(`  Using viem ERC-20 calls…`);
      metaMap = await viemTokenMeta(addresses, chain);
    }

    const found = metaMap.size;
    console.log(`  Resolved: ${found} / ${addresses.length}`);

    if (DRY_RUN) {
      let shown = 0;
      for (const [addr, meta] of metaMap) {
        if (shown++ >= 5) break;
        console.log(`    ${addr} → symbol="${meta.symbol}" name="${meta.name}"`);
      }
      continue;
    }

    // Build update list
    const updates: Array<{ id: number; symbol: string; name: string }> = [];
    for (const entry of entries) {
      const meta = metaMap.get(entry.address);
      if (meta) updates.push({ id: entry.id, symbol: meta.symbol, name: meta.name });
    }

    const n = await batchUpdate(updates);
    console.log(`  Updated ${n} rows`);
  }

  if (!DRY_RUN) {
    const r = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM entities WHERE source='defillama-pools' AND label != entity_name`,
    );
    console.log(`\ndefillama-pools entries with real token labels: ${r.rows[0].cnt}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
