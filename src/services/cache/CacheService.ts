import Redis from 'ioredis';
import { env } from '../../config/index.js';

// In-memory fallback when Redis is unavailable (dev mode)
class MemoryCache {
  private store = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  del(key: string): void {
    this.store.delete(key);
  }
}

let redis: Redis | null = null;
let memoryCache: MemoryCache | null = null;
let redisAvailable = true;

function getBackend(): Redis | MemoryCache {
  if (!redisAvailable) {
    if (!memoryCache) memoryCache = new MemoryCache();
    return memoryCache;
  }

  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    redis.on('error', () => {
      if (redisAvailable) {
        redisAvailable = false;
        console.warn('[Cache] Redis unavailable — falling back to in-memory cache');
      }
    });
  }
  return redis;
}

export class CacheService {
  private prefix: string;

  constructor(prefix = 'ts') {
    this.prefix = prefix;
    // Eagerly init so errors are caught at startup, not first request
    getBackend();
  }

  private key(k: string): string {
    return `${this.prefix}:${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const backend = getBackend();
      let raw: string | null;
      if (backend instanceof MemoryCache) {
        raw = backend.get(this.key(key));
      } else {
        raw = await backend.get(this.key(key));
      }
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const backend = getBackend();
      const serialized = JSON.stringify(value);
      if (backend instanceof MemoryCache) {
        backend.set(this.key(key), serialized, ttlSeconds);
      } else {
        await backend.set(this.key(key), serialized, 'EX', ttlSeconds);
      }
    } catch {
      // Cache write failure is non-critical
    }
  }

  async del(key: string): Promise<void> {
    try {
      const backend = getBackend();
      if (backend instanceof MemoryCache) {
        backend.del(this.key(key));
      } else {
        await (backend as Redis).del(this.key(key));
      }
    } catch {
      // ignore
    }
  }
}

// Cache key constants
export const CACHE_KEYS = {
  decodedTx: (chain: string, hash: string) => `tx:decoded:${chain}:${hash}`,
  rawTx: (chain: string, hash: string) => `tx:raw:${chain}:${hash}`,
  blockTimestamp: (chain: string, blockNumber: number) => `block:ts:${chain}:${blockNumber}`,
  tokenMetadata: (chain: string, address: string) => `token:meta:${chain}:${address}`,
  tokenPrice: (symbol: string) => `price:${symbol.toLowerCase()}`,
} as const;

export const TTL = {
  DECODED_TX: 300,
  RAW_TX: 3600,
  BLOCK_TIMESTAMP: 86400 * 30,
  TOKEN_METADATA: 86400,
  TOKEN_PRICE: 300,
  ENS: 3600,
} as const;
