import { db } from '../db/Database.js';
import { CacheService, TTL } from '../cache/CacheService.js';
import { ENTITY_MAP, KNOWN_ENTITIES, type KnownEntity } from './known-entities.js';
import { bloomFilterService } from './BloomFilterService.js';
import type { SupportedChain } from '../../types/chain.types.js';

export interface EntityInfo {
  address: string;
  label: string;
  entity_name: string;
  entity_type: string;
  tags: string[];
  source: 'static' | 'db';
}

const cache = new CacheService('entity');

export class EntityService {
  /**
   * Look up an address on a specific chain.
   * Priority: in-memory static map → Redis cache → PostgreSQL DB
   */
  async lookup(address: string, chain: SupportedChain): Promise<EntityInfo | null> {
    const addr = address.toLowerCase();

    // 1. Static map (zero latency)
    const staticEntry = ENTITY_MAP.get(`${addr}:${chain}`) ?? ENTITY_MAP.get(`${addr}:multi`);
    if (staticEntry) return this.toInfo(staticEntry, 'static');

    // 2. Bloom filter — skip Redis + DB entirely if address is definitely absent
    if (!bloomFilterService.test(addr, chain)) return null;

    // 3. Redis cache
    const cacheKey = `entity:${addr}:${chain}`;
    const cached = await cache.get<EntityInfo>(cacheKey);
    if (cached !== null) return cached;

    // 4. PostgreSQL
    try {
      const row = await db.queryOne<{
        address: string; label: string; entity_name: string;
        entity_type: string; tags: string[];
      }>(
        `SELECT address, label, entity_name, entity_type, tags
         FROM entities
         WHERE address = $1 AND (chain = $2 OR chain = 'multi')
         ORDER BY (chain = $2) DESC
         LIMIT 1`,
        [addr, chain]
      );

      if (row) {
        const info: EntityInfo = { address: addr, label: row.label, entity_name: row.entity_name, entity_type: row.entity_type, tags: row.tags, source: 'db' };
        await cache.set(cacheKey, info, TTL.TOKEN_METADATA);
        return info;
      }
    } catch {
      // DB not available — fall through
    }

    // Cache negative result for 10 min to avoid repeated DB hits
    await cache.set(cacheKey, null, 600);
    return null;
  }

  /**
   * Batch lookup — used by tx decode enrichment
   */
  async lookupMany(addresses: string[], chain: SupportedChain): Promise<Map<string, EntityInfo>> {
    const result = new Map<string, EntityInfo>();
    await Promise.all(
      addresses.map(async (addr) => {
        const info = await this.lookup(addr, chain);
        if (info) result.set(addr.toLowerCase(), info);
      })
    );
    return result;
  }

  /**
   * Return all known wallets belonging to a named entity (e.g. "Binance", "Jump Trading").
   * Merges static KNOWN_ENTITIES with DB rows, deduplicating by address.
   */
  async getWalletsByEntity(entityName: string): Promise<EntityInfo[]> {
    const name = entityName.toLowerCase();

    // Static entries matching the entity name
    const staticMatches = KNOWN_ENTITIES
      .filter((e) => e.entity_name.toLowerCase() === name)
      .map((e) => this.toInfo(e, 'static'));

    // DB entries
    let dbMatches: EntityInfo[] = [];
    try {
      const result = await db.query<{
        address: string; label: string; entity_name: string;
        entity_type: string; tags: string[];
      }>(
        `SELECT address, label, entity_name, entity_type, tags
         FROM entities
         WHERE LOWER(entity_name) = $1`,
        [name]
      );
      dbMatches = result.rows.map((r) => ({
        address: r.address,
        label: r.label,
        entity_name: r.entity_name,
        entity_type: r.entity_type,
        tags: r.tags ?? [],
        source: 'db' as const,
      }));
    } catch {
      // DB not available — use static only
    }

    // Merge: static takes precedence, deduplicate by address
    const seen = new Set<string>();
    const merged: EntityInfo[] = [];
    for (const e of [...staticMatches, ...dbMatches]) {
      if (!seen.has(e.address)) {
        seen.add(e.address);
        merged.push(e);
      }
    }
    return merged;
  }

  /**
   * Seed the DB from the static list (run once via script)
   */
  async seedDatabase(): Promise<number> {
    let inserted = 0;
    for (const e of KNOWN_ENTITIES) {
      try {
        await db.query(
          `INSERT INTO entities (address, chain, label, entity_name, entity_type, tags)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (address, chain) DO UPDATE
             SET label = EXCLUDED.label,
                 entity_name = EXCLUDED.entity_name,
                 entity_type = EXCLUDED.entity_type,
                 tags = EXCLUDED.tags,
                 updated_at = NOW()`,
          [e.address.toLowerCase(), e.chain, e.label, e.entity_name, e.entity_type, e.tags ?? []]
        );
        bloomFilterService.add(e.address, e.chain);
        inserted++;
      } catch {
        // ignore individual failures
      }
    }
    return inserted;
  }

  private toInfo(e: KnownEntity, source: 'static' | 'db'): EntityInfo {
    return {
      address: e.address.toLowerCase(),
      label: e.label,
      entity_name: e.entity_name,
      entity_type: e.entity_type,
      tags: e.tags ?? [],
      source,
    };
  }
}

export const entityService = new EntityService();
