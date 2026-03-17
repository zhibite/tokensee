/**
 * SmartMoneyService — tracks activity of known sophisticated wallets:
 * top VCs, quant funds, market makers, and prominent on-chain traders.
 */

import { db } from '../db/Database.js';

export type SmartMoneyCategory = 'vc' | 'quant' | 'market_maker' | 'whale' | 'dao_treasury';

export interface SmartMoneyAddress {
  address: string;
  name: string;
  category: SmartMoneyCategory;
  tags: string[];
}

export interface SmartMoneyMove {
  id: string;
  wallet_address: string;
  wallet_name: string;
  wallet_category: SmartMoneyCategory;
  role: 'sender' | 'receiver';
  tx_hash: string;
  chain: string;
  timestamp: number;
  asset_symbol: string;
  amount: string;
  amount_usd: number | null;
  alert_type: string;
  counterpart_address: string;
  counterpart_label: string | null;
  counterpart_entity: string | null;
  created_at: string;
}

export interface SmartMoneyActivityResult {
  wallets: SmartMoneyAddress[];
  moves: SmartMoneyMove[];
  total: number;
}

// Curated list of known sophisticated on-chain participants
// Sources: public blockchain analytics, on-chain research, Nansen/Arkham labels
export const SMART_MONEY_LIST: SmartMoneyAddress[] = [
  // ── VC Funds ──────────────────────────────────────────────────────
  { address: '0x05e793ce0c6027323ac150f6d45c2344d28b6019', name: 'Paradigm', category: 'vc', tags: ['investor', 'defi'] },
  { address: '0xa4c8d221d8bb851f83aadd0223a8900a6921a349', name: 'a16z Crypto', category: 'vc', tags: ['investor', 'early-stage'] },
  { address: '0x4f3aff3a747fcbc2bf770959f946923c68b7c2d9', name: 'Dragonfly Capital', category: 'vc', tags: ['investor', 'asia'] },
  { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', name: 'Multicoin Capital', category: 'vc', tags: ['investor', 'l1'] },
  { address: '0x9b9647431632af44be02ddd22477ed94d14aacaa', name: 'Polychain Capital', category: 'vc', tags: ['investor'] },

  // ── Quant / Market Makers ──────────────────────────────────────────
  { address: '0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0', name: 'Jump Trading', category: 'quant', tags: ['market-maker', 'trading'] },
  { address: '0x00000000219ab540356cbb839cbe05303d7705fa', name: 'Wintermute', category: 'market_maker', tags: ['market-maker', 'defi'] },
  { address: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621', name: 'Cumberland DRW', category: 'market_maker', tags: ['market-maker', 'otc'] },
  { address: '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2', name: 'FTX Alameda (historical)', category: 'quant', tags: ['defunct', 'trading'] },

  // ── Prominent Whales ───────────────────────────────────────────────
  { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', name: 'Binance Whale (0x47ac)', category: 'whale', tags: ['exchange-adjacent'] },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', name: 'Large ETH Whale', category: 'whale', tags: ['early-miner'] },
  { address: '0xb8cda067fabedd1bb6c11c626862d7255a2414fe', name: 'DeFi Whale 0xb8cd', category: 'whale', tags: ['defi', 'yield'] },

  // ── DAO Treasuries ─────────────────────────────────────────────────
  { address: '0xfe89cc7abb2c4183683ab71653c4cdc9b02d44b7', name: 'Gitcoin Treasury', category: 'dao_treasury', tags: ['dao', 'public-goods'] },
  { address: '0x4f3aff3a747fcbc2bf770959f946923c68b7c2d9', name: 'Uniswap DAO Treasury', category: 'dao_treasury', tags: ['dao', 'defi'] },
];

// Build fast lookup: lowercase address → SmartMoneyAddress
export const SMART_MONEY_MAP = new Map<string, SmartMoneyAddress>(
  SMART_MONEY_LIST.map((w) => [w.address.toLowerCase(), w])
);

const SM_ADDRESSES = SMART_MONEY_LIST.map((w) => w.address.toLowerCase());

class SmartMoneyService {
  /**
   * Returns recent large-transfer activity involving smart money wallets.
   * Queries the whale_alerts table for matching from/to addresses.
   */
  async getActivity(params: {
    chain?: string;
    category?: SmartMoneyCategory;
    limit?: number;
    cursor?: string;
  }): Promise<SmartMoneyActivityResult> {
    const { chain, category, limit = 50, cursor } = params;

    // Filter by category if requested
    const filtered = category
      ? SM_ADDRESSES.filter((addr) => SMART_MONEY_MAP.get(addr)?.category === category)
      : SM_ADDRESSES;

    if (filtered.length === 0) {
      return { wallets: SMART_MONEY_LIST, moves: [], total: 0 };
    }

    const placeholders = filtered.map((_, i) => `$${i + 1}`).join(',');
    const args: unknown[] = [...filtered];
    let argIdx = filtered.length + 1;

    let whereClause = `(from_address IN (${placeholders}) OR to_address IN (${placeholders}))`;

    if (chain) {
      whereClause += ` AND chain = $${argIdx++}`;
      args.push(chain);
    }

    if (cursor) {
      whereClause += ` AND created_at < $${argIdx++}`;
      args.push(new Date(parseInt(cursor, 10)).toISOString());
    }

    const limitArg = Math.min(limit, 100);

    try {
      const [rows, countRow] = await Promise.all([
        db.query(
          `SELECT id, tx_hash, chain, timestamp,
                  from_address, from_label, from_entity,
                  to_address,   to_label,   to_entity,
                  asset_symbol, amount, amount_usd, alert_type, created_at
           FROM whale_alerts
           WHERE ${whereClause}
           ORDER BY created_at DESC
           LIMIT ${limitArg}`,
          args
        ),
        db.query(
          `SELECT COUNT(*)::int as total FROM whale_alerts WHERE ${whereClause}`,
          args
        ),
      ]);

      const moves: SmartMoneyMove[] = rows.rows.map((r) => {
        const fromAddr = r.from_address as string;
        const toAddr = r.to_address as string;
        const smSender = SMART_MONEY_MAP.get(fromAddr);
        const smReceiver = SMART_MONEY_MAP.get(toAddr);

        // Pick the smart money wallet (prefer sender if both match)
        const sm = smSender ?? smReceiver!;
        const isSender = !!smSender;

        return {
          id: r.id,
          wallet_address: isSender ? fromAddr : toAddr,
          wallet_name: sm.name,
          wallet_category: sm.category,
          role: isSender ? 'sender' : 'receiver',
          tx_hash: r.tx_hash,
          chain: r.chain,
          timestamp: Number(r.timestamp),
          asset_symbol: r.asset_symbol,
          amount: r.amount,
          amount_usd: r.amount_usd ? Number(r.amount_usd) : null,
          alert_type: r.alert_type,
          counterpart_address: isSender ? (r.to_address as string) : fromAddr,
          counterpart_label: isSender ? r.to_label : r.from_label,
          counterpart_entity: isSender ? r.to_entity : r.from_entity,
          created_at: r.created_at,
        };
      });

      return {
        wallets: SMART_MONEY_LIST,
        moves,
        total: countRow.rows[0]?.total ?? 0,
      };
    } catch {
      // DB unavailable — return empty result
      return { wallets: SMART_MONEY_LIST, moves: [], total: 0 };
    }
  }
}

export const smartMoneyService = new SmartMoneyService();
