/**
 * SocialIdentityService
 *
 * Aggregates all known social identities for an EVM address from the entity library.
 * Sources mapped to platforms:
 *   ens / ens-bulk          → ENS
 *   lens                    → Lens Protocol
 *   farcaster               → Farcaster
 *   everything else         → entity (on-chain label)
 *
 * Also does a live ENS reverse-lookup if the address has no ENS entry in the DB.
 */

import { db } from '../db/Database.js';
import { CacheService, TTL } from '../cache/CacheService.js';
import { EnsService } from '../ens/EnsService.js';

export type SocialPlatform = 'ens' | 'lens' | 'farcaster' | 'entity';

export interface SocialIdentity {
  platform:   SocialPlatform;
  handle:     string;           // e.g. "vitalik.eth", "@vitalik", "vitalik (Farcaster)"
  label:      string;           // raw label from entity library
  entity_type: string;
  confidence: 'high' | 'medium' | 'low';
  source:     string;           // e.g. "ens-bulk", "lens", "farcaster"
  chain:      string;
}

export interface SocialProfile {
  address:    string;
  identities: SocialIdentity[];
  ens:        string | null;    // primary ENS name (highest confidence)
  lens:       string | null;    // primary Lens handle
  farcaster:  string | null;    // primary Farcaster handle
  entity:     string | null;    // primary entity label (non-social source)
}

// Source → platform mapping
const SOURCE_TO_PLATFORM: Record<string, SocialPlatform> = {
  'ens':        'ens',
  'ens-bulk':   'ens',
  'lens':       'lens',
  'farcaster':  'farcaster',
};

function sourceToPlatform(source: string): SocialPlatform {
  return SOURCE_TO_PLATFORM[source] ?? 'entity';
}

// Format a handle based on platform
function formatHandle(label: string, platform: SocialPlatform): string {
  if (platform === 'lens' && !label.startsWith('@') && !label.includes('.lens')) {
    return `@${label}`;
  }
  return label;
}

const cache = new CacheService('social');
const ensService = new EnsService();

export class SocialIdentityService {
  /**
   * Get all social identities for an address.
   * Queries the entity library across all chains, then groups by platform.
   */
  async getProfile(address: string): Promise<SocialProfile> {
    const addr = address.toLowerCase();
    const cacheKey = `profile:${addr}`;

    const cached = await cache.get<SocialProfile>(cacheKey);
    if (cached) return cached;

    // Query all rows for this address across all chains, ordered by confidence
    const rows = await db.query<{
      label:       string;
      entity_name: string;
      entity_type: string;
      confidence:  string;
      source:      string;
      chain:       string;
    }>(
      `SELECT label, entity_name, entity_type, confidence, source, chain
       FROM entities
       WHERE address = $1
       ORDER BY
         CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         CASE source
           WHEN 'ens'       THEN 0
           WHEN 'ens-bulk'  THEN 1
           WHEN 'lens'      THEN 2
           WHEN 'farcaster' THEN 3
           ELSE 4
         END`,
      [addr],
    );

    const identities: SocialIdentity[] = rows.rows.map((r) => {
      const platform = sourceToPlatform(r.source);
      return {
        platform,
        handle:      formatHandle(r.label, platform),
        label:       r.label,
        entity_type: r.entity_type,
        confidence:  r.confidence as 'high' | 'medium' | 'low',
        source:      r.source,
        chain:       r.chain,
      };
    });

    // Derive primary handles per platform
    const byPlatform = (p: SocialPlatform) =>
      identities.find((i) => i.platform === p)?.handle ?? null;

    let ensName = byPlatform('ens');

    // Live ENS fallback — if not in DB, try reverse resolve
    if (!ensName) {
      try {
        const live = await ensService.getName(addr);
        if (live) {
          ensName = live;
          // Inject a synthetic identity entry at the front
          identities.unshift({
            platform:    'ens',
            handle:      live,
            label:       live,
            entity_type: 'kol',
            confidence:  'medium',
            source:      'ens-live',
            chain:       'ethereum',
          });
        }
      } catch {
        // ENS unavailable — skip silently
      }
    }

    const profile: SocialProfile = {
      address:   addr,
      identities,
      ens:       ensName,
      lens:      byPlatform('lens'),
      farcaster: byPlatform('farcaster'),
      entity:    identities.find((i) => i.platform === 'entity')?.label ?? null,
    };

    await cache.set(cacheKey, profile, TTL.DECODED_TX); // 5 min cache
    return profile;
  }

  /**
   * Batch lookup — resolve social profiles for multiple addresses at once.
   * Returns a map of address → profile.
   */
  async getBatch(addresses: string[]): Promise<Record<string, SocialProfile>> {
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
    if (unique.length === 0) return {};

    const rows = await db.query<{
      address:     string;
      label:       string;
      entity_type: string;
      confidence:  string;
      source:      string;
      chain:       string;
    }>(
      `SELECT address, label, entity_type, confidence, source, chain
       FROM entities
       WHERE address = ANY($1)
       ORDER BY address,
         CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      [unique],
    );

    // Group by address
    const grouped: Record<string, typeof rows.rows> = {};
    for (const r of rows.rows) {
      (grouped[r.address] ??= []).push(r);
    }

    const result: Record<string, SocialProfile> = {};
    for (const addr of unique) {
      const addrRows = grouped[addr] ?? [];
      const identities: SocialIdentity[] = addrRows.map((r) => {
        const platform = sourceToPlatform(r.source);
        return {
          platform,
          handle:      formatHandle(r.label, platform),
          label:       r.label,
          entity_type: r.entity_type,
          confidence:  r.confidence as 'high' | 'medium' | 'low',
          source:      r.source,
          chain:       r.chain,
        };
      });

      const byPlatform = (p: SocialPlatform) =>
        identities.find((i) => i.platform === p)?.handle ?? null;

      result[addr] = {
        address:   addr,
        identities,
        ens:       byPlatform('ens'),
        lens:      byPlatform('lens'),
        farcaster: byPlatform('farcaster'),
        entity:    identities.find((i) => i.platform === 'entity')?.label ?? null,
      };
    }

    return result;
  }
}

export const socialIdentityService = new SocialIdentityService();
