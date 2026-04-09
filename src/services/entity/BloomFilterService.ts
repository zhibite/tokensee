/**
 * BloomFilterService
 *
 * Maintains an in-memory Bloom Filter of all (address, chain) pairs in the
 * entities table. Used by EntityService.lookup() as the first gate:
 *
 *   test(addr, chain) === false  →  definitely not in DB, return null immediately
 *   test(addr, chain) === true   →  might be in DB, proceed to Redis / PostgreSQL
 *
 * This eliminates DB + Redis round-trips for the vast majority of addresses
 * that appear in WhaleMonitor but have no entity label.
 *
 * Filter parameters (1% false-positive rate):
 *   1.2M  entries → ~1.4 MB RAM
 *   10M   entries → ~12  MB RAM
 *   100M  entries → ~120 MB RAM
 *
 * Startup strategy:
 *   1. Try loading serialized filter from Redis (key: bloom:entities)
 *   2. If miss, stream all addresses from PostgreSQL and build fresh
 *   3. Persist result to Redis (TTL: 2h) for fast restarts
 *   4. Until filter is ready, lookup() proceeds without it (no false negatives)
 */

import bloomFiltersModule from 'bloom-filters';
const { BloomFilter } = bloomFiltersModule;
import { db } from '../db/Database.js';
import { CacheService } from '../cache/CacheService.js';

const REDIS_KEY = 'bloom:entities';
const REDIS_TTL = 7200; // 2 hours

// All chains — used to expand 'multi' entries
const ALL_CHAINS: string[] = [
  'ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche',
  'zksync', 'linea', 'scroll', 'zkevm', 'mantle', 'gnosis', 'metis', 'boba', 'blast', 'mode',
];

// Expected maximum entries (plan for 10M to avoid resizing)
const EXPECTED_ENTRIES = 10_000_000;
const ERROR_RATE = 0.01; // 1% false-positive rate

const redisCache = new CacheService('bloom');

export class BloomFilterService {
  private filter: InstanceType<typeof BloomFilter> | null = null;
  private _ready = false;
  private _loading = false;
  private _count = 0;

  get ready(): boolean { return this._ready; }
  get count(): number { return this._count; }

  /**
   * Start async initialization — non-blocking, lookups degrade gracefully until ready.
   */
  init(): void {
    if (this._loading || this._ready) return;
    this._loading = true;
    this.load().catch((err) => {
      console.warn('[BloomFilter] Init failed, running without filter:', (err as Error).message);
      this._loading = false;
    });
  }

  /**
   * Test whether an address+chain combination might be in the entities table.
   * Returns true (might exist) or false (definitely not in DB).
   * If filter is not ready, always returns true (safe default).
   */
  test(address: string, chain: string): boolean {
    if (!this._ready || !this.filter) return true; // not ready → pass through
    const key = `${address.toLowerCase()}:${chain}`;
    return this.filter.has(key);
  }

  /**
   * Add a new address to the filter (called when a new entity is inserted).
   * Also adds 'multi' chain variants when relevant.
   */
  add(address: string, chain: string): void {
    if (!this.filter) return;
    const addr = address.toLowerCase();
    if (chain === 'multi') {
      for (const c of ALL_CHAINS) this.filter.add(`${addr}:${c}`);
    } else {
      this.filter.add(`${addr}:${chain}`);
      // Also add for 'multi' queries
      this.filter.add(`${addr}:multi`);
    }
    this._count++;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    const t0 = Date.now();

    // 1. Try Redis cache
    try {
      const cached = await redisCache.get<object>(REDIS_KEY);
      if (cached) {
        this.filter = BloomFilter.fromJSON(cached as Parameters<typeof BloomFilter.fromJSON>[0]);
        this._ready = true;
        this._loading = false;
        this._count = await this.countFromDB();
        console.log(`[BloomFilter] Loaded from Redis (${this._count.toLocaleString()} entries, ${Date.now() - t0}ms)`);
        return;
      }
    } catch {
      // Redis unavailable — fall through to DB load
    }

    // 2. Build from PostgreSQL — keyset-paginated to avoid loading millions of rows at once.
    //    Exclude 'onchain-scan' (anonymous address dumps — no meaningful labels).
    console.log('[BloomFilter] Building from PostgreSQL…');
    this.filter = BloomFilter.create(EXPECTED_ENTRIES, ERROR_RATE);

    const BATCH_SIZE = 50_000;
    let lastId = 0;
    let totalLoaded = 0;

    while (true) {
      const { rows } = await db.query<{ id: number; address: string; chain: string }>(
        `SELECT id, address, chain FROM entities
         WHERE id > $1 AND source != 'onchain-scan'
         ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const addr = row.address.toLowerCase();
        if (row.chain === 'multi') {
          for (const c of ALL_CHAINS) this.filter.add(`${addr}:${c}`);
        } else {
          this.filter.add(`${addr}:${row.chain}`);
          this.filter.add(`${addr}:multi`);
        }
      }

      totalLoaded += rows.length;
      lastId = Number(rows[rows.length - 1].id);

      if (rows.length < BATCH_SIZE) break;

      // Yield to event loop between batches and log progress
      if (totalLoaded % 500_000 === 0) {
        console.log(`[BloomFilter] Loaded ${totalLoaded.toLocaleString()} entries…`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    this._count = totalLoaded;
    this._ready = true;
    this._loading = false;

    const elapsed = Date.now() - t0;
    console.log(`[BloomFilter] Built: ${this._count.toLocaleString()} entries, ${elapsed}ms`);

    // 3. Persist to Redis for fast restarts
    try {
      await redisCache.set(REDIS_KEY, this.filter.saveAsJSON(), REDIS_TTL);
      console.log(`[BloomFilter] Persisted to Redis (TTL: ${REDIS_TTL}s)`);
    } catch {
      // Redis unavailable — filter works fine in-memory
    }
  }

  private async countFromDB(): Promise<number> {
    try {
      const r = await db.queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM entities`);
      return parseInt(r?.cnt ?? '0', 10);
    } catch {
      return 0;
    }
  }

  /**
   * Invalidate Redis cache (call after bulk imports to force rebuild on next restart).
   */
  async invalidateCache(): Promise<void> {
    try {
      await redisCache.del(REDIS_KEY);
    } catch { /* ignore */ }
  }
}

export const bloomFilterService = new BloomFilterService();
