import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../../services/db/Database.js';
import { env } from '../../config/index.js';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey + env.API_KEY_SALT).digest('hex');
}

/**
 * Optional API key middleware.
 *
 * Behavior:
 *  - If REQUIRE_API_KEY env is falsy (default in dev): passes through without a key,
 *    but still validates the key if one IS provided.
 *  - If REQUIRE_API_KEY=true: rejects requests with no key in production.
 *
 * Header: X-Api-Key: <raw key>
 */
export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawKey = typeof req.headers['x-api-key'] === 'string'
    ? req.headers['x-api-key']
    : undefined;

  // No key provided
  if (!rawKey) {
    // In development, allow unauthenticated access
    if (env.NODE_ENV !== 'production') {
      return next();
    }
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_API_KEY', message: 'API key required. Pass X-Api-Key header.' },
    });
    return;
  }

  // Key provided — validate
  const keyHash = hashKey(rawKey);
  try {
    const row = await db.queryOne<{ id: string; tier: string; rate_limit_rpm: number }>(
      `SELECT id, tier, rate_limit_rpm
       FROM api_keys
       WHERE key_hash = $1 AND is_active = TRUE`,
      [keyHash]
    );

    if (!row) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key.' },
      });
      return;
    }

    // Attach key metadata to request for downstream use
    (req as Request & { apiKey?: { id: string; tier: string; rateLimit: number } }).apiKey = {
      id: row.id,
      tier: row.tier,
      rateLimit: row.rate_limit_rpm,
    };

    // Update last_used_at asynchronously
    void db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]);

    return next();
  } catch (err) {
    // DB error — fail open in dev, fail closed in prod
    if (env.NODE_ENV !== 'production') {
      console.warn('[apiKey] DB error, failing open:', err);
      return next();
    }
    res.status(503).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Authentication service unavailable.' },
    });
  }
}

/**
 * Helper: create and store a new API key.
 * Returns the raw key (shown once) and the stored hash.
 */
export async function createApiKey(name: string, tier = 'free'): Promise<{ raw: string; hash: string }> {
  const raw = `ts_${createHash('sha256').update(Math.random().toString() + Date.now()).digest('hex').slice(0, 40)}`;
  const hash = hashKey(raw);
  const rateLimitRpm = tier === 'pro' ? 600 : tier === 'starter' ? 180 : 60;

  await db.query(
    `INSERT INTO api_keys (key_hash, name, tier, rate_limit_rpm)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key_hash) DO NOTHING`,
    [hash, name, tier, rateLimitRpm]
  );

  return { raw, hash };
}
