/**
 * SmartMoneyService — tracks activity of known sophisticated wallets.
 *
 * Address sources (merged at query time):
 *   1. STATIC_LIST  — hardcoded market makers / quant / top VCs (fast IN clause)
 *   2. Dynamic DB   — entities WHERE entity_type IN ('fund','dao','institution','kol')
 *                     AND confidence IN ('high','medium')
 *                     JOINed directly with whale_alerts (no huge IN clause)
 */

import { db } from '../db/Database.js';
import { CacheService, TTL } from '../cache/CacheService.js';

export type SmartMoneyCategory = 'vc' | 'quant' | 'market_maker' | 'whale' | 'dao_treasury';

export interface SmartMoneyAddress {
  address:  string;
  name:     string;
  category: SmartMoneyCategory;
  tags:     string[];
}

export interface SmartMoneyMove {
  id:                  string;
  wallet_address:      string;
  wallet_name:         string;
  wallet_category:     SmartMoneyCategory;
  role:                'sender' | 'receiver';
  tx_hash:             string;
  chain:               string;
  timestamp:           number;
  asset_symbol:        string;
  amount:              string;
  amount_usd:          number | null;
  alert_type:          string;
  counterpart_address: string;
  counterpart_label:   string | null;
  counterpart_entity:  string | null;
  created_at:          string;
}

export interface SmartMoneyActivityResult {
  wallets: SmartMoneyAddress[];
  moves:   SmartMoneyMove[];
  total:   number;
}

// ─── entity_type → SmartMoneyCategory ────────────────────────────────────────

function entityTypeToCategory(type: string, source: string): SmartMoneyCategory {
  if (type === 'dao')         return 'dao_treasury';
  if (type === 'institution') return 'vc';
  if (type === 'kol')         return 'whale';
  // fund: check source for VC vs quant
  if (source === 'defillama-treasury' || source === 'snapshot') return 'dao_treasury';
  return 'vc';
}

// ─── Static list (market makers / quants / top VCs) ──────────────────────────
// These are kept hardcoded for their specific categories.

export const STATIC_SMART_MONEY: SmartMoneyAddress[] = [
  // ── VC Funds ──────────────────────────────────────────────────────────────
  { address: '0x05e793ce0c6027323ac150f6d45c2344d28b6019', name: 'Paradigm',              category: 'vc',           tags: ['investor', 'defi'] },
  { address: '0xa4c8d221d8bb851f83aadd0223a8900a6921a349', name: 'a16z Crypto',            category: 'vc',           tags: ['investor', 'early-stage'] },
  { address: '0x4f3aff3a747fcbc2bf770959f946923c68b7c2d9', name: 'Dragonfly Capital',      category: 'vc',           tags: ['investor', 'asia'] },
  { address: '0x9b9647431632af44be02ddd22477ed94d14aacaa', name: 'Polychain Capital',      category: 'vc',           tags: ['investor'] },
  { address: '0x8ec07aabe9f79fdf14de87b2c1aad4c1c7d25a93', name: 'Multicoin Capital',      category: 'vc',           tags: ['investor', 'l1'] },
  { address: '0x7587a71b79b15c3e53f3c82d69d92f4a8fd16aa8', name: 'Pantera Capital',        category: 'vc',           tags: ['investor', 'btc-focused'] },
  { address: '0x1db3439a222c519ab44bb1144fc28167b4fa6ee6', name: 'Animoca Brands',         category: 'vc',           tags: ['investor', 'nft', 'gaming'] },
  { address: '0x220866b1a2219f40e72f5c628b65d54268ca3a9d', name: 'Andreessen Horowitz',    category: 'vc',           tags: ['investor'] },
  { address: '0x9aa7db8e488ee3ffcc9cdfd4f788f06cac7f4b37', name: 'Coinbase Ventures',      category: 'vc',           tags: ['investor', 'cex'] },
  { address: '0x4862733b5fddfd35f35ea8ccf08f5045e57388b3', name: 'Three Arrows Capital',   category: 'vc',           tags: ['investor', 'defunct'] },
  { address: '0xd68f5f831b8a6f8a06e89e7ab1ec4d8f8a3bfe8b', name: 'Sequoia Capital',        category: 'vc',           tags: ['investor'] },
  { address: '0xbbbbbbbbb6cc5431c3e5a39ab15c3d58abf3e522', name: 'Spartan Group',          category: 'vc',           tags: ['investor', 'asia'] },

  // ── Quant / Market Makers ──────────────────────────────────────────────────
  { address: '0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0', name: 'Jump Trading',           category: 'quant',        tags: ['market-maker', 'trading'] },
  { address: '0x00000000219ab540356cbb839cbe05303d7705fa', name: 'Wintermute',             category: 'market_maker', tags: ['market-maker', 'defi'] },
  { address: '0x8eb8a3b98659cce290402893d0123abb75e3ab28', name: 'Alameda Research',        category: 'quant',        tags: ['defunct', 'trading'] },
  { address: '0xeb2629a2734e272bcc07bda959863f316f4bd4cf', name: 'Amber Group',             category: 'market_maker', tags: ['market-maker', 'asia'] },
  { address: '0x77ad3a15b78101883af36ad4a875e17c86ac65d1', name: 'QCP Capital',             category: 'quant',        tags: ['trading', 'options'] },
  { address: '0xdbf5e9c5206d0db70a90108bf936da60221dc080', name: 'GSR Markets',             category: 'market_maker', tags: ['market-maker', 'otc'] },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', name: 'B2C2',                   category: 'market_maker', tags: ['market-maker'] },
  { address: '0x56178a0d5f301baf6cf3e1cd53d9863437345bf9', name: 'Galaxy Digital',          category: 'quant',        tags: ['trading', 'institutional'] },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Flow Traders',            category: 'market_maker', tags: ['market-maker', 'etf'] },

  // ── Prominent Whales ───────────────────────────────────────────────────────
  { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', name: 'Binance Cold Wallet',    category: 'whale',        tags: ['exchange', 'large-holder'] },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', name: 'Binance Hot Wallet',      category: 'whale',        tags: ['exchange', 'large-holder'] },
  { address: '0xb8cda067fabedd1bb6c11c626862d7255a2414fe', name: 'DeFi Whale 0xb8cd',      category: 'whale',        tags: ['defi', 'yield'] },
  { address: '0x73bceb1cd57c711feac4224d062b0f6ff338501e', name: 'Whale 0x73bc',            category: 'whale',        tags: ['large-holder'] },
  { address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', name: 'Vitalik Buterin',         category: 'whale',        tags: ['founder', 'eth'] },
  { address: '0xab5801a7d398351b8be11c439e05c5b3259aec9b', name: 'Vitalik Buterin 2',       category: 'whale',        tags: ['founder', 'eth'] },

  // ── Major DAO Treasuries ───────────────────────────────────────────────────
  { address: '0xfe89cc7abb2c4183683ab71653c4cdc9b02d44b7', name: 'Gitcoin Treasury',        category: 'dao_treasury', tags: ['dao', 'public-goods'] },
  { address: '0x1a9c8182c09f50c8318d769245bea52c32be35bc', name: 'Uniswap Treasury',        category: 'dao_treasury', tags: ['dao', 'defi'] },
  { address: '0x3d5fc645320be0a085a32885c8b6db0916d5f68b', name: 'Aave Treasury',           category: 'dao_treasury', tags: ['dao', 'lending'] },
  { address: '0x61c8d4e4be6477bb49791540ff297ef30eaa01c2', name: 'Compound Treasury',       category: 'dao_treasury', tags: ['dao', 'lending'] },
  { address: '0x0bc3807ec262cb779b38d65b38158acc3bfede10', name: 'MakerDAO Treasury',       category: 'dao_treasury', tags: ['dao', 'stablecoin'] },
  { address: '0x93315845caf28b1f4dc08df22bf0a63e38cbfe5c', name: 'Lido Treasury',           category: 'dao_treasury', tags: ['dao', 'staking'] },
  { address: '0x4f9b7dedd8865871df35c6a4d4b7b8e4b5e7f8a2', name: 'Curve DAO Treasury',     category: 'dao_treasury', tags: ['dao', 'defi'] },
];

// Build fast lookup map
export const STATIC_SM_MAP = new Map<string, SmartMoneyAddress>(
  STATIC_SMART_MONEY.map((w) => [w.address.toLowerCase(), w])
);

const cache = new CacheService('smart-money');

// ─── SmartMoneyService ────────────────────────────────────────────────────────

class SmartMoneyService {
  /**
   * Load entity-library addresses that qualify as smart money.
   * Cached for 10 minutes to avoid repeated DB scans.
   */
  private async loadDynamicWallets(): Promise<SmartMoneyAddress[]> {
    const cacheKey = 'dynamic-wallets';
    const cached = await cache.get<SmartMoneyAddress[]>(cacheKey);
    if (cached) return cached;

    try {
      const rows = await db.query<{
        address: string; entity_name: string; entity_type: string; source: string; label: string;
      }>(
        `SELECT DISTINCT ON (address) address, entity_name, entity_type, source, label
         FROM entities
         WHERE entity_type IN ('fund', 'dao', 'institution', 'kol')
           AND confidence IN ('high', 'medium')
           AND chain IN ('ethereum', 'multi')
           AND source NOT IN ('scamsniffer', 'mew-darklist', 'forta-github')
         ORDER BY address,
           CASE confidence WHEN 'high' THEN 0 ELSE 1 END,
           CASE source
             WHEN 'import'              THEN 0
             WHEN 'defillama-treasury'  THEN 1
             WHEN 'snapshot'            THEN 2
             WHEN 'github-labels'       THEN 3
             ELSE 4
           END
         LIMIT 5000`,
      );

      const wallets: SmartMoneyAddress[] = rows.rows
        .filter((r) => !STATIC_SM_MAP.has(r.address)) // skip already in static list
        .map((r) => ({
          address:  r.address,
          name:     r.entity_name || r.label.slice(0, 40),
          category: entityTypeToCategory(r.entity_type, r.source),
          tags:     [r.entity_type, r.source],
        }));

      await cache.set(cacheKey, wallets, 600); // 10 min
      return wallets;
    } catch {
      return [];
    }
  }

  /**
   * Returns all smart money wallets (static + dynamic).
   */
  async getWallets(params?: {
    category?: SmartMoneyCategory;
    limit?: number;
    offset?: number;
  }): Promise<{ wallets: SmartMoneyAddress[]; total: number }> {
    const dynamic = await this.loadDynamicWallets();
    // Deduplicate by address (static list takes priority)
    const seen = new Set<string>();
    const all: SmartMoneyAddress[] = [];
    for (const w of [...STATIC_SMART_MONEY, ...dynamic]) {
      const addr = w.address.toLowerCase();
      if (!seen.has(addr)) { seen.add(addr); all.push(w); }
    }

    const filtered = params?.category
      ? all.filter((w) => w.category === params.category)
      : all;

    const limit  = params?.limit  ?? 50;
    const offset = params?.offset ?? 0;

    return {
      wallets: filtered.slice(offset, offset + limit),
      total:   filtered.length,
    };
  }

  /**
   * Returns recent whale_alerts activity involving smart money wallets.
   * Uses a DB JOIN against the entities table so no huge IN clause needed.
   */
  async getActivity(params: {
    chain?:    string;
    category?: SmartMoneyCategory;
    limit?:    number;
    cursor?:   string;
  }): Promise<{ moves: SmartMoneyMove[]; total: number }> {
    const { chain, category, limit = 50, cursor } = params;
    const limitArg = Math.min(limit, 100);

    // Static addresses for this category (or all)
    const staticAddrs = category
      ? STATIC_SMART_MONEY.filter((w) => w.category === category).map((w) => w.address)
      : STATIC_SMART_MONEY.map((w) => w.address);

    // Dynamic entity types that map to the requested category
    const dynamicTypes: string[] = (() => {
      if (!category) return ['fund', 'dao', 'institution', 'kol'];
      if (category === 'dao_treasury') return ['dao'];
      if (category === 'vc')           return ['fund', 'institution'];
      if (category === 'whale')        return ['kol'];
      return [];
    })();

    // Build query parts
    const args: unknown[] = [];
    let argIdx = 1;

    // Static placeholder set
    const staticPhs = staticAddrs.map(() => `$${argIdx++}`).join(',');
    args.push(...staticAddrs);

    // Dynamic entity types
    const typePhs = dynamicTypes.map(() => `$${argIdx++}`).join(',');
    args.push(...dynamicTypes);

    let extraWhere = '';
    if (chain) {
      extraWhere += ` AND wa.chain = $${argIdx++}`;
      args.push(chain);
    }
    if (cursor) {
      extraWhere += ` AND wa.created_at < $${argIdx++}`;
      args.push(new Date(parseInt(cursor, 10)).toISOString());
    }

    // Unified query: static OR dynamic JOIN
    const staticCond = staticAddrs.length > 0
      ? `(wa.from_address IN (${staticPhs}) OR wa.to_address IN (${staticPhs}))`
      : 'FALSE';

    const dynamicCond = dynamicTypes.length > 0
      ? `EXISTS (
          SELECT 1 FROM entities e
          WHERE e.entity_type IN (${typePhs})
            AND e.confidence IN ('high','medium')
            AND e.chain IN (wa.chain, 'multi')
            AND (e.address = wa.from_address OR e.address = wa.to_address)
        )`
      : 'FALSE';

    const whereClause = `(${staticCond} OR ${dynamicCond})${extraWhere}`;

    try {
      const [rows, countRow] = await Promise.all([
        db.query(
          `SELECT wa.id, wa.tx_hash, wa.chain, wa.timestamp,
                  wa.from_address, wa.from_label, wa.from_entity,
                  wa.to_address,   wa.to_label,   wa.to_entity,
                  wa.asset_symbol, wa.amount, wa.amount_usd, wa.alert_type, wa.created_at
           FROM whale_alerts wa
           WHERE ${whereClause}
           ORDER BY wa.created_at DESC
           LIMIT ${limitArg}`,
          args,
        ),
        db.query(
          `SELECT COUNT(*)::int as total FROM whale_alerts wa WHERE ${whereClause}`,
          args,
        ),
      ]);

      // Resolve wallet name — check static map first, then entity DB
      const unknownAddrs = new Set<string>();
      for (const r of rows.rows) {
        if (!STATIC_SM_MAP.has(r.from_address)) unknownAddrs.add(r.from_address);
        if (!STATIC_SM_MAP.has(r.to_address))   unknownAddrs.add(r.to_address);
      }

      // Load entity labels for unknown addresses
      const entityMap = new Map<string, { name: string; type: string; source: string }>();
      if (unknownAddrs.size > 0) {
        const eRows = await db.query<{ address: string; entity_name: string; entity_type: string; source: string }>(
          `SELECT DISTINCT ON (address) address, entity_name, entity_type, source
           FROM entities
           WHERE address = ANY($1)
             AND entity_type IN ('fund','dao','institution','kol')
             AND confidence IN ('high','medium')
           ORDER BY address, CASE confidence WHEN 'high' THEN 0 ELSE 1 END`,
          [[...unknownAddrs]],
        );
        for (const e of eRows.rows) {
          entityMap.set(e.address, { name: e.entity_name, type: e.entity_type, source: e.source });
        }
      }

      const moves: SmartMoneyMove[] = rows.rows.map((r) => {
        const fromAddr = r.from_address as string;
        const toAddr   = r.to_address   as string;

        // Determine which side is smart money
        const smStatic  = STATIC_SM_MAP.get(fromAddr) ?? STATIC_SM_MAP.get(toAddr);
        const smDynFrom = entityMap.get(fromAddr);
        const smDynTo   = entityMap.get(toAddr);
        const smDyn     = smDynFrom ?? smDynTo;

        const smAddr    = smStatic?.address ?? (smDynFrom ? fromAddr : toAddr);
        const smName    = smStatic?.name    ?? smDyn?.name ?? smAddr.slice(0, 10);
        const smCat     = smStatic?.category ?? (smDyn ? entityTypeToCategory(smDyn.type, smDyn.source) : 'whale');
        const isSender  = smAddr === fromAddr;

        return {
          id:                  r.id,
          wallet_address:      smAddr,
          wallet_name:         smName,
          wallet_category:     smCat,
          role:                isSender ? 'sender' : 'receiver',
          tx_hash:             r.tx_hash,
          chain:               r.chain,
          timestamp:           Number(r.timestamp),
          asset_symbol:        r.asset_symbol,
          amount:              r.amount,
          amount_usd:          r.amount_usd ? Number(r.amount_usd) : null,
          alert_type:          r.alert_type,
          counterpart_address: isSender ? toAddr : fromAddr,
          counterpart_label:   isSender ? r.to_label : r.from_label,
          counterpart_entity:  isSender ? r.to_entity : r.from_entity,
          created_at:          r.created_at,
        };
      });

      return { moves, total: countRow.rows[0]?.total ?? 0 };
    } catch (err) {
      console.error('[SmartMoney] query failed:', err);
      return { moves: [], total: 0 };
    }
  }

  /** Stats: breakdown by category */
  async getStats(): Promise<{ by_category: Record<string, { count: number; volume_usd: number; wallets: number }> }> {
    const dynamic = await this.loadDynamicWallets();
    const all = [...STATIC_SMART_MONEY, ...dynamic];

    const walletsByCategory = all.reduce<Record<string, number>>((acc, w) => {
      acc[w.category] = (acc[w.category] ?? 0) + 1;
      return acc;
    }, {});

    const staticAddrs = STATIC_SMART_MONEY.map((w) => w.address);

    try {
      const rows = await db.query<{ category: string; cnt: string; vol: string }>(
        `SELECT
           CASE
             WHEN wa.from_address = ANY($1) OR wa.to_address = ANY($1) THEN 'static'
             ELSE 'dynamic'
           END as src,
           COUNT(*)::int as cnt,
           SUM(COALESCE(wa.amount_usd, 0)) as vol
         FROM whale_alerts wa
         WHERE EXISTS (
           SELECT 1 FROM entities e
           WHERE e.entity_type IN ('fund','dao','institution','kol')
             AND e.confidence IN ('high','medium')
             AND (e.address = wa.from_address OR e.address = wa.to_address)
         ) OR wa.from_address = ANY($1) OR wa.to_address = ANY($1)
         GROUP BY src`,
        [staticAddrs],
      );

      // Build by_category breakdown using wallet counts
      const by_category: Record<string, { count: number; volume_usd: number; wallets: number }> = {};
      for (const [cat, wCount] of Object.entries(walletsByCategory)) {
        by_category[cat] = { count: 0, volume_usd: 0, wallets: wCount };
      }

      return { by_category };
    } catch {
      const by_category: Record<string, { count: number; volume_usd: number; wallets: number }> = {};
      for (const [cat, wCount] of Object.entries(walletsByCategory)) {
        by_category[cat] = { count: 0, volume_usd: 0, wallets: wCount };
      }
      return { by_category };
    }
  }
}

export const smartMoneyService = new SmartMoneyService();
// Re-export for backwards compat
export const SMART_MONEY_LIST = STATIC_SMART_MONEY;
export const SMART_MONEY_MAP  = STATIC_SM_MAP;
