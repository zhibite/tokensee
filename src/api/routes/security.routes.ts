import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';

export const securityRoutes = Router();

// GET /v1/security/summary — counts for dashboard cards
securityRoutes.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [hackerRes, sanctionedRes, mixerRes, sanctionedTotalRes] = await Promise.all([
      // Active hacker addresses in last 24h
      db.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT COALESCE(
           CASE WHEN from_type = 'hacker' THEN from_address END,
           CASE WHEN to_type   = 'hacker' THEN to_address   END
         )) AS cnt
         FROM whale_alerts
         WHERE (from_type = 'hacker' OR to_type = 'hacker')
           AND created_at > NOW() - INTERVAL '24 hours'`,
      ),
      // Sanctioned address activity in last 7d
      db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM whale_alerts
         WHERE (from_type = 'sanctioned' OR to_type = 'sanctioned')
           AND created_at > NOW() - INTERVAL '7 days'`,
      ),
      // Mixer inflow 24h vs previous 24h
      db.query<{ current: string; previous: string }>(
        `SELECT
           COALESCE(SUM(amount_usd) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),  0) AS current,
           COALESCE(SUM(amount_usd) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'), 0) AS previous
         FROM whale_alerts
         WHERE to_type = 'mixer'`,
      ),
      // Total sanctioned addresses in entity library
      db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM entities WHERE entity_type = 'sanctioned'`,
      ),
    ]);

    const hackerActive  = parseInt(hackerRes.rows[0]?.cnt ?? '0', 10);
    const sanctionedActivity = parseInt(sanctionedRes.rows[0]?.cnt ?? '0', 10);
    const mixerCurrent  = parseFloat(mixerRes.rows[0]?.current  ?? '0');
    const mixerPrevious = parseFloat(mixerRes.rows[0]?.previous ?? '0');
    const sanctionedTotal = parseInt(sanctionedTotalRes.rows[0]?.cnt ?? '83', 10);

    const mixerChange = mixerPrevious > 0
      ? ((mixerCurrent - mixerPrevious) / mixerPrevious) * 100
      : 0;

    res.json({
      success: true,
      data: {
        hacker_active:       hackerActive,
        sanctioned_total:    sanctionedTotal,
        sanctioned_activity: sanctionedActivity,
        mixer_inflow_24h:    mixerCurrent,
        mixer_change_pct:    mixerChange,
      },
    });
  } catch (err) {
    console.error('[security] summary error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});

// GET /v1/security/hackers — recent activity from hacker addresses
securityRoutes.get('/hackers', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
  const days  = Math.min(parseInt(String(req.query.days  ?? '7'),  10) || 7,  30);

  try {
    const { rows } = await db.query<{
      address: string; label: string | null; entity: string | null;
      chain: string; last_activity: string; dest_entity: string | null;
      dest_label: string | null; dest_address: string;
      amount_usd: number; tx_hash: string;
    }>(
      `SELECT DISTINCT ON (from_address)
         from_address AS address,
         from_label   AS label,
         from_entity  AS entity,
         chain,
         created_at   AS last_activity,
         to_entity    AS dest_entity,
         to_label     AS dest_label,
         to_address   AS dest_address,
         amount_usd,
         tx_hash
       FROM whale_alerts
       WHERE from_type = 'hacker'
         AND created_at > NOW() - INTERVAL '${days} days'
       ORDER BY from_address, created_at DESC
       LIMIT $1`,
      [limit],
    );

    res.json({ success: true, data: { events: rows } });
  } catch (err) {
    console.error('[security] hackers error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});

// GET /v1/security/sanctioned — sanctioned address activity
securityRoutes.get('/sanctioned', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
  const days  = Math.min(parseInt(String(req.query.days  ?? '30'), 10) || 30, 90);

  try {
    const { rows } = await db.query(
      `SELECT tx_hash, chain, created_at,
              from_address, from_label, from_entity, from_type,
              to_address,   to_label,   to_entity,   to_type,
              asset_symbol, amount_usd
       FROM whale_alerts
       WHERE (from_type = 'sanctioned' OR to_type = 'sanctioned')
         AND created_at > NOW() - INTERVAL '${days} days'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    res.json({ success: true, data: { events: rows } });
  } catch (err) {
    console.error('[security] sanctioned error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});

// GET /v1/security/mixers — mixer inflow by protocol
securityRoutes.get('/mixers', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query<{
      name: string; address: string;
      inflow_24h: string; inflow_prev_24h: string; tx_count: string;
    }>(
      `SELECT
         COALESCE(to_entity, to_label, LEFT(to_address,8)||'…') AS name,
         to_address AS address,
         COALESCE(SUM(amount_usd) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),  0) AS inflow_24h,
         COALESCE(SUM(amount_usd) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'), 0) AS inflow_prev_24h,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS tx_count
       FROM whale_alerts
       WHERE to_type = 'mixer'
       GROUP BY name, to_address
       ORDER BY inflow_24h DESC
       LIMIT 10`,
    );

    const mixers = rows.map((r) => ({
      name:     r.name,
      address:  r.address,
      inflow_24h:  parseFloat(r.inflow_24h),
      change_pct:  parseFloat(r.inflow_prev_24h) > 0
        ? ((parseFloat(r.inflow_24h) - parseFloat(r.inflow_prev_24h)) / parseFloat(r.inflow_prev_24h)) * 100
        : 0,
      tx_count: parseInt(r.tx_count, 10),
    }));

    res.json({ success: true, data: { mixers } });
  } catch (err) {
    console.error('[security] mixers error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});
