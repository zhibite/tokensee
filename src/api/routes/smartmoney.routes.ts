import { Router } from 'express';
import type { Request, Response } from 'express';
import { smartMoneyService, SMART_MONEY_MAP } from '../../services/smartmoney/SmartMoneyService.js';
import type { SmartMoneyCategory } from '../../services/smartmoney/SmartMoneyService.js';
import { db } from '../../services/db/Database.js';

export const smartMoneyRoutes = Router();

// GET /v1/smart-money/wallets — list of tracked wallets (static + dynamic) with activity counts
smartMoneyRoutes.get('/wallets', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category as SmartMoneyCategory : undefined;
  const limit    = typeof req.query.limit  === 'string' ? Math.min(parseInt(req.query.limit, 10) || 50, 200) : 50;
  const offset   = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) || 0 : 0;

  const { wallets, total } = await smartMoneyService.getWallets({ category, limit, offset });

  // Attach 30-day activity count where available
  const addrs = wallets.map((w) => w.address.toLowerCase());
  let activityCounts: Record<string, number> = {};
  try {
    const result = await db.query<{ address: string; cnt: string }>(
      `SELECT from_address AS address, COUNT(*) AS cnt FROM whale_alerts
       WHERE from_address = ANY($1) AND timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
       GROUP BY from_address
       UNION ALL
       SELECT to_address, COUNT(*) FROM whale_alerts
       WHERE to_address = ANY($1) AND timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
       GROUP BY to_address`,
      [addrs],
    );
    for (const row of result.rows) {
      const addr = row.address.toLowerCase();
      activityCounts[addr] = (activityCounts[addr] ?? 0) + parseInt(row.cnt, 10);
    }
  } catch { /* DB unavailable */ }

  const enriched = wallets
    .map((w) => ({ ...w, activity_30d: activityCounts[w.address.toLowerCase()] ?? 0 }))
    .sort((a, b) => b.activity_30d - a.activity_30d);

  res.json({ success: true, data: { wallets: enriched, total } });
});

// GET /v1/smart-money/stats — aggregate stats per category
smartMoneyRoutes.get('/stats', async (_req: Request, res: Response) => {
  const { by_category } = await smartMoneyService.getStats();
  const total_wallets = Object.values(by_category).reduce((s, v) => s + v.wallets, 0);
  return res.json({ success: true, data: { by_category, total_wallets } });
});

// GET /v1/smart-money/wallet/:address — activity for a single SM wallet
smartMoneyRoutes.get('/wallet/:address', async (req: Request, res: Response) => {
  const address = String(req.params['address'] ?? '').toLowerCase();

  // Check static map first
  const wallet = SMART_MONEY_MAP.get(address);
  if (!wallet) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not a tracked wallet' } });
  }

  const limit = 20;
  try {
    const rows = await db.query(
      `SELECT tx_hash, chain, timestamp, from_address, from_label, from_entity,
              to_address, to_label, to_entity, asset_symbol, amount, amount_usd, alert_type, created_at
       FROM whale_alerts
       WHERE from_address = $1 OR to_address = $1
       ORDER BY timestamp DESC LIMIT $2`,
      [address, limit],
    );
    return res.json({ success: true, data: { wallet, moves: rows.rows } });
  } catch {
    return res.json({ success: true, data: { wallet, moves: [] } });
  }
});

// GET /v1/smart-money/activity — recent moves by smart money wallets
smartMoneyRoutes.get('/activity', async (req: Request, res: Response) => {
  const chain    = typeof req.query.chain    === 'string' ? req.query.chain    : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category as SmartMoneyCategory : undefined;
  const limit    = typeof req.query.limit    === 'string' ? Math.min(parseInt(req.query.limit, 10) || 50, 100) : 50;
  const cursor   = typeof req.query.cursor   === 'string' ? req.query.cursor   : undefined;

  const result = await smartMoneyService.getActivity({ chain, category, limit, cursor });

  // Build next cursor from last item's created_at
  const lastItem = result.moves[result.moves.length - 1];
  const nextCursor = lastItem
    ? String(new Date(lastItem.created_at).getTime())
    : null;

  res.json({
    success: true,
    data: {
      moves:    result.moves,
      total:    result.total,
      has_more: result.moves.length === limit,
      cursor:   nextCursor,
    },
  });
});
