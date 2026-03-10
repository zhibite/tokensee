import { normalize } from 'viem/ens';
import type { Address } from 'viem';
import { rpcManager } from '../rpc/RpcManager.js';
import { CacheService, TTL } from '../cache/CacheService.js';

const cache = new CacheService('ens');

export class EnsService {
  /**
   * Resolve an ENS name for an Ethereum address.
   * Returns null if no ENS name is registered or on error.
   * Result cached for 1 hour.
   */
  async getName(address: string): Promise<string | null> {
    const lower = address.toLowerCase();
    const cacheKey = `name:${lower}`;

    const cached = await cache.get<string | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const client = rpcManager.getClient('ethereum');
      const name = await client.getEnsName({ address: lower as Address });
      // Validate reverse lookup matches forward lookup
      if (name) {
        try {
          const fwd = await client.getEnsAddress({ name: normalize(name) });
          if (fwd?.toLowerCase() !== lower) {
            await cache.set(cacheKey, null, TTL.ENS ?? 3600);
            return null;
          }
        } catch {
          await cache.set(cacheKey, null, TTL.ENS ?? 3600);
          return null;
        }
      }
      await cache.set(cacheKey, name ?? null, TTL.ENS ?? 3600);
      return name ?? null;
    } catch {
      await cache.set(cacheKey, null, 300);
      return null;
    }
  }

  /**
   * Resolve address from ENS name.
   * Returns null if name doesn't resolve or on error.
   */
  async getAddress(name: string): Promise<string | null> {
    const cacheKey = `addr:${name.toLowerCase()}`;
    const cached = await cache.get<string | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const client = rpcManager.getClient('ethereum');
      const address = await client.getEnsAddress({ name: normalize(name) });
      const result = address ? address.toLowerCase() : null;
      await cache.set(cacheKey, result, TTL.ENS ?? 3600);
      return result;
    } catch {
      await cache.set(cacheKey, null, 300);
      return null;
    }
  }
}

export const ensService = new EnsService();
