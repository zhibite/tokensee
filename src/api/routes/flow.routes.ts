import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';

export const flowRoutes = Router();

// GET /v1/flow/pairs — top entity pairs by volume
flowRoutes.get('/pairs', async (req: Request, res: Response) => {
  const chain   = typeof req.query.chain   === 'string' ? req.query.chain   : undefined;
  const window  = typeof req.query.window  === 'string' ? req.query.window  : '24h';
  const limit   = Math.min(parseInt(String(req.query.limit ?? '30'), 10) || 30, 100);

  const intervalMap: Record<string, string> = {
    '24h': '24 hours', '7d': '7 days', '30d': '30 days',
  };
  const interval = intervalMap[window] ?? '24 hours';

  try {
    const conditions = [
      `from_entity IS NOT NULL`,
      `to_entity   IS NOT NULL`,
      `created_at > NOW() - INTERVAL '${interval}'`,
    ];
    const params: unknown[] = [];
    let idx = 1;

    if (chain) {
      conditions.push(`chain = $${idx++}`);
      params.push(chain);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await db.query<{
      from_name: string; from_type: string | null; from_address: string;
      to_name: string;   to_type: string | null;   to_address: string;
      chain: string; volume_usd: string; tx_count: string;
    }>(
      `SELECT
         from_entity                AS from_name,
         from_type,
         from_address,
         to_entity                  AS to_name,
         to_type,
         to_address,
         chain,
         SUM(amount_usd)            AS volume_usd,
         COUNT(*)                   AS tx_count
       FROM whale_alerts
       ${where}
       GROUP BY from_entity, from_type, from_address, to_entity, to_type, to_address, chain
       ORDER BY SUM(amount_usd) DESC
       LIMIT $${idx}`,
      [...params, limit],
    );

    const pairs = rows.map((r) => ({
      from:      r.from_name,
      from_type: r.from_type,
      from_address: r.from_address,
      to:        r.to_name,
      to_type:   r.to_type,
      to_address: r.to_address,
      chain:     r.chain.toUpperCase(),
      volume_usd: parseFloat(r.volume_usd),
      tx_count:  parseInt(r.tx_count, 10),
    }));

    // Summary stats
    const statsRes = await db.query<{ total_volume: string; total_txns: string; unique_entities: string }>(
      `SELECT
         COALESCE(SUM(amount_usd), 0)                  AS total_volume,
         COUNT(*)                                       AS total_txns,
         COUNT(DISTINCT from_entity) + COUNT(DISTINCT to_entity) AS unique_entities
       FROM whale_alerts
       ${where}`,
      params,
    );
    const s = statsRes.rows[0];

    // Top entities by volume (combined in/out)
    const topEntitiesRes = await db.query<{ name: string; type: string | null; volume: string }>(
      `SELECT name, type, SUM(vol) AS volume FROM (
         SELECT from_entity AS name, from_type AS type, SUM(amount_usd) AS vol
         FROM whale_alerts ${where} GROUP BY from_entity, from_type
         UNION ALL
         SELECT to_entity, to_type, SUM(amount_usd)
         FROM whale_alerts ${where} GROUP BY to_entity, to_type
       ) t
       GROUP BY name, type
       ORDER BY volume DESC
       LIMIT 10`,
      params,
    );

    res.json({
      success: true,
      data: {
        pairs,
        stats: {
          total_volume:     parseFloat(s?.total_volume ?? '0'),
          total_txns:       parseInt(s?.total_txns ?? '0', 10),
          unique_entities:  parseInt(s?.unique_entities ?? '0', 10),
        },
        top_entities: topEntitiesRes.rows.map((r) => ({
          name:   r.name,
          type:   r.type,
          volume: parseFloat(r.volume),
        })),
        window,
      },
    });
  } catch (err) {
    console.error('[flow] pairs error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});
