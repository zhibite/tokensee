/**
 * ArkhamService — real-time address label lookup via Arkham Intelligence API.
 *
 * Used as a fallback when the local entity library has no record for an address.
 * Results are cached in Redis (1h TTL) and optionally persisted to the DB.
 *
 * Free tier: ~20 req/sec, no bulk export.
 * Requires ARKHAM_API_KEY in .env (sign up at https://intel.arkm.com/api).
 *
 * API docs: https://docs.intel.arkm.com
 */

import axios from 'axios';
import { db } from '../db/Database.js';
import { CacheService } from '../cache/CacheService.js';

const cache = new CacheService('arkham');

const ARKHAM_BASE = 'https://api.arkhamintelligence.com';
const CACHE_TTL_S = 3600; // 1 hour

// ─── Response types ───────────────────────────────────────────────────────────

interface ArkhamEntity {
  id: string;
  name: string;
  type: string;         // 'cex', 'dex', 'defi', 'fund', 'individual', 'nft', ...
  website?: string;
  twitter?: string;
  note?: string;
  addresses?: Array<{
    address: string;
    chain: string;
    arkhamLabel?: { name: string };
  }>;
}

interface ArkhamResponse {
  address: string;
  chain: string;
  arkhamEntity?: ArkhamEntity;
  arkhamLabel?: { name: string; address: string; chainType: string };
  isUserAddress: boolean;
  contract: boolean;
}

export interface ArkhamLookupResult {
  found: boolean;
  entity_name: string | null;
  entity_type: string | null;
  label: string | null;
  source: 'arkham';
}

// ─── Type mapping ─────────────────────────────────────────────────────────────

const ARKHAM_TYPE_MAP: Record<string, string> = {
  cex:         'exchange',
  dex:         'protocol',
  defi:        'protocol',
  fund:        'fund',
  individual:  'kol',
  nft:         'nft',
  bridge:      'bridge',
  mixer:       'mixer',
  dao:         'dao',
  oracle:      'oracle',
  government:  'institution',
  sanctioned:  'sanctioned',
  hacker:      'hacker',
  miner:       'miner',
  stablecoin:  'stablecoin',
};

function mapArkhamType(arkhamType: string): string {
  return ARKHAM_TYPE_MAP[arkhamType?.toLowerCase()] ?? 'protocol';
}

// ─── ArkhamService ────────────────────────────────────────────────────────────

class ArkhamService {
  private readonly apiKey: string | null;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.ARKHAM_API_KEY ?? null;
    this.enabled = Boolean(this.apiKey);
    if (!this.enabled) {
      console.log('[Arkham] No ARKHAM_API_KEY set — service disabled');
    }
  }

  /**
   * Look up a single address.
   * Returns cached result if available; otherwise queries the Arkham API.
   * Optionally persists the result to the entities table.
   */
  async lookup(address: string, persist = true): Promise<ArkhamLookupResult> {
    if (!this.enabled) return { found: false, entity_name: null, entity_type: null, label: null, source: 'arkham' };

    const addr = address.toLowerCase();
    const cacheKey = `arkham:${addr}`;

    // 1. Try Redis cache
    const cached = await cache.get<ArkhamLookupResult>(cacheKey);
    if (cached) return cached;

    // 2. Query Arkham API
    let result: ArkhamLookupResult;
    try {
      const res = await axios.get<ArkhamResponse>(
        `${ARKHAM_BASE}/intelligence/address/${addr}`,
        {
          headers: { 'API-Key': this.apiKey! },
          timeout: 8_000,
        }
      );

      const entity   = res.data?.arkhamEntity;
      const arkLabel = res.data?.arkhamLabel?.name ?? entity?.name ?? null;
      const arkType  = entity?.type ?? null;

      if (!entity && !arkLabel) {
        result = { found: false, entity_name: null, entity_type: null, label: null, source: 'arkham' };
      } else {
        result = {
          found:       true,
          entity_name: entity?.name ?? null,
          entity_type: arkType ? mapArkhamType(arkType) : 'protocol',
          label:       arkLabel,
          source:      'arkham',
        };
      }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      if (status === 404) {
        result = { found: false, entity_name: null, entity_type: null, label: null, source: 'arkham' };
      } else {
        // API error — don't cache, don't persist
        return { found: false, entity_name: null, entity_type: null, label: null, source: 'arkham' };
      }
    }

    // 3. Cache result
    await cache.set(cacheKey, result, CACHE_TTL_S);

    // 4. Persist to DB if found and persist=true
    if (result.found && persist && result.entity_name && result.entity_type && result.label) {
      this.persistToDB(addr, result).catch(() => { /* non-blocking */ });
    }

    return result;
  }

  private async persistToDB(address: string, r: ArkhamLookupResult): Promise<void> {
    try {
      await db.query(
        `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
         VALUES ($1, 'ethereum', $2, $3, $4, 'medium', 'arkham', '{}')
         ON CONFLICT (address, chain) DO NOTHING`,
        [address, r.label, r.entity_name, r.entity_type]
      );
    } catch { /* ignore */ }
  }

  get isEnabled(): boolean { return this.enabled; }
}

export const arkhamService = new ArkhamService();
