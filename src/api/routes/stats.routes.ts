/**
 * GET /v1/stats — aggregated on-chain activity stats
 *
 * Query params:
 *   window  — "1h" | "24h" | "7d"  (default: "24h")
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';
import type { ApiError } from '../../types/transaction.types.js';

export const statsRoutes = Router();

const WINDOW_MAP: Record<string, string> = {
  '1h':  '1 hour',
  '24h': '24 hours',
  '7d':  '7 days',
};

statsRoutes.get('/', async (req: Request, res: Response) => {
  const windowKey = typeof req.query.window === 'string' ? req.query.window : '24h';
  const interval = WINDOW_MAP[windowKey] ?? '24 hours';

  try {
    // Run aggregation queries in parallel
    const [totalsRes, chainRes, typeRes, topAssetsRes] = await Promise.all([
      // Total count + volume
      db.query<{ alert_count: string; total_volume_usd: string }>(
        `SELECT COUNT(*) AS alert_count, COALESCE(SUM(amount_usd), 0) AS total_volume_usd
         FROM whale_alerts
         WHERE created_at > NOW() - INTERVAL '${interval}'`
      ),
      // By chain
      db.query<{ chain: string; count: string; volume_usd: string }>(
        `SELECT chain, COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS volume_usd
         FROM whale_alerts
         WHERE created_at > NOW() - INTERVAL '${interval}'
         GROUP BY chain
         ORDER BY volume_usd DESC`
      ),
      // By alert type
      db.query<{ alert_type: string; count: string; volume_usd: string }>(
        `SELECT alert_type, COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS volume_usd
         FROM whale_alerts
         WHERE created_at > NOW() - INTERVAL '${interval}'
         GROUP BY alert_type
         ORDER BY count DESC`
      ),
      // Top assets by volume
      db.query<{ asset_symbol: string; count: string; volume_usd: string }>(
        `SELECT asset_symbol, COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS volume_usd
         FROM whale_alerts
         WHERE created_at > NOW() - INTERVAL '${interval}'
         GROUP BY asset_symbol
         ORDER BY volume_usd DESC
         LIMIT 10`
      ),
    ]);

    const totals = totalsRes.rows[0];

    return res.json({
      success: true,
      data: {
        window: windowKey,
        total_alerts: Number(totals?.alert_count ?? 0),
        total_volume_usd: Number(totals?.total_volume_usd ?? 0),
        by_chain: chainRes.rows.map((r) => ({
          chain: r.chain,
          count: Number(r.count),
          volume_usd: Number(r.volume_usd),
        })),
        by_type: typeRes.rows.map((r) => ({
          type: r.alert_type,
          count: Number(r.count),
          volume_usd: Number(r.volume_usd),
        })),
        top_assets: topAssetsRes.rows.map((r) => ({
          symbol: r.asset_symbol,
          count: Number(r.count),
          volume_usd: Number(r.volume_usd),
        })),
      },
    });
  } catch (err) {
    const error: ApiError = {
      success: false,
      error: {
        code: 'STATS_FETCH_FAILED',
        message: process.env.NODE_ENV === 'development'
          ? (err instanceof Error ? err.message : String(err))
          : 'Failed to fetch stats',
      },
    };
    return res.status(500).json(error);
  }
});
