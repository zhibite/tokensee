/**
 * ClusteringService — heuristic address labeling via behavioral pattern analysis.
 *
 * Patterns detected:
 *   1. Exchange Deposit Address
 *      An address sends funds to a known exchange hot wallet ≥ N times.
 *      → Label as "<Exchange> Deposit Address" with confidence 'medium'.
 *
 *   2. Internal Transfer Address (coming soon)
 *      Two unlabeled addresses always move together (fund A → B → C where B is unknown)
 *      → B is likely an intermediary controlled by the same actor.
 *
 * Runs as a background job every 10 minutes, scans recent whale_alerts data.
 * Writes results to the entities table (ON CONFLICT DO NOTHING — never overwrites
 * high-confidence manual entries).
 */

import { db } from '../db/Database.js';

// An address must send to the same exchange at least this many times to be labeled.
const DEPOSIT_MIN_TXNS = 3;

// How many days of whale_alerts history to scan
const LOOKBACK_DAYS = 30;

// ─── Known exchange wallet addresses → entity name ───────────────────────────
// We detect deposit addresses by checking if `to_address` is in this set.
// (These are the exchanges' hot / deposit collection wallets already in our DB.)
const EXCHANGE_LABELS: Record<string, string> = {
  // Binance
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0x56eddb7aa87536c09ccc2793473599fd21a8b17f': 'Binance',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance',
  '0xf977814e90da44bfa03b6295a0616a897441acec': 'Binance',
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': 'Binance',
  // Coinbase
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x77696bb39917c91a0c3908d577d5e322095425ca': 'Coinbase',
  '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase',
  // OKX
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKX',
  '0x98ec059dc3adfbdd63429454aeb0c990fba4a128': 'OKX',
  '0x8b99f3660622e21f2910ecca7fbe51d654a1517d': 'OKX',
  // Kraken
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken',
  '0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13': 'Kraken',
  // Bybit
  '0xf89d7b9c864f589bbF53a82105107622B35EaA40': 'Bybit',
  '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4': 'Bybit',
};

// ─── ClusteringService ────────────────────────────────────────────────────────

class ClusteringService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    // Run once shortly after start, then every 10 minutes
    setTimeout(() => this.scan(), 30_000);
    this.timer = setInterval(() => this.scan(), 10 * 60 * 1_000);
    this.timer.unref?.();
    console.log('[Clustering] Started — scanning every 10 minutes');
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Manually trigger a full scan (also called on schedule). */
  async scan(): Promise<{ depositAddresses: number }> {
    if (this.running) return { depositAddresses: 0 };
    this.running = true;

    try {
      const depositAddresses = await this.detectDepositAddresses();
      if (depositAddresses > 0) {
        console.log(`[Clustering] ✅ Labeled ${depositAddresses} exchange deposit addresses`);
      }
      return { depositAddresses };
    } catch (err) {
      console.error('[Clustering] Scan error:', err instanceof Error ? err.message : err);
      return { depositAddresses: 0 };
    } finally {
      this.running = false;
    }
  }

  // ─── Pattern 1: Exchange deposit address detection ─────────────────────────

  /**
   * Find addresses that sent funds to a known exchange wallet ≥ DEPOSIT_MIN_TXNS times
   * within the last LOOKBACK_DAYS days. Label them as deposit addresses.
   */
  private async detectDepositAddresses(): Promise<number> {
    const cutoffTs = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86_400;
    const knownAddrs = Object.keys(EXCHANGE_LABELS);
    if (knownAddrs.length === 0) return 0;

    // Also pull exchange wallets from the DB (entity_type = 'exchange')
    let dbExchangeAddrs: string[] = [];
    try {
      const rows = await db.query<{ address: string; entity_name: string }>(
        `SELECT address, entity_name FROM entities
         WHERE entity_type = 'exchange' AND confidence IN ('high', 'medium')
         LIMIT 500`
      );
      dbExchangeAddrs = rows.rows.map((r) => r.address.toLowerCase());
    } catch { /* DB unavailable */ }

    // Build the full set of exchange addresses to look for in to_address
    const allExchangeAddrs = [...new Set([...knownAddrs.map((a) => a.toLowerCase()), ...dbExchangeAddrs])];
    if (allExchangeAddrs.length === 0) return 0;

    // Find from_addresses that sent to exchange wallets multiple times
    let candidates: Array<{ from_address: string; to_address: string; tx_count: string }> = [];
    try {
      const result = await db.query<{
        from_address: string; to_address: string; tx_count: string;
      }>(
        `SELECT from_address, to_address, COUNT(*) AS tx_count
         FROM whale_alerts
         WHERE timestamp >= $1
           AND to_address = ANY($2)
           AND from_label IS NULL        -- only unlabeled senders
           AND from_entity IS NULL
         GROUP BY from_address, to_address
         HAVING COUNT(*) >= $3
         ORDER BY tx_count DESC
         LIMIT 200`,
        [cutoffTs, allExchangeAddrs, DEPOSIT_MIN_TXNS]
      );
      candidates = result.rows;
    } catch (err) {
      // If the query fails (e.g. whale_alerts doesn't exist yet), skip silently
      return 0;
    }

    if (candidates.length === 0) return 0;

    let inserted = 0;
    for (const row of candidates) {
      const fromAddr   = row.from_address.toLowerCase();
      const toAddr     = row.to_address.toLowerCase();
      const txCount    = parseInt(row.tx_count, 10);

      // Resolve exchange name: first check hardcoded map, then DB
      let exchangeName: string | undefined = EXCHANGE_LABELS[toAddr] ?? EXCHANGE_LABELS[row.to_address];
      if (!exchangeName) {
        try {
          const dbRow = await db.queryOne<{ entity_name: string }>(
            `SELECT entity_name FROM entities WHERE address = $1 AND entity_type = 'exchange' LIMIT 1`,
            [toAddr]
          );
          exchangeName = dbRow?.entity_name;
        } catch { /* skip */ }
      }
      if (!exchangeName) continue;
      const resolvedName: string = exchangeName;

      const label = `${resolvedName} Deposit Address`;
      const chain = 'ethereum'; // whale_alerts doesn't filter by chain in this query

      try {
        const result = await db.query(
          `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
           VALUES ($1, $2, $3, $4, 'exchange', 'medium', 'clustering', ARRAY['deposit-address'])
           ON CONFLICT (address, chain) DO NOTHING`,
          [fromAddr, chain, label, resolvedName]
        );
        if ((result.rowCount ?? 0) > 0) {
          inserted++;
          console.log(
            `[Clustering] 🔍 ${fromAddr.slice(0,10)}… → ${resolvedName} deposit address (${txCount} txns)`
          );
        }
      } catch { /* ignore */ }
    }

    return inserted;
  }
}

export const clusteringService = new ClusteringService();
