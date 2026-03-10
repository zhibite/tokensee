import { Router } from 'express';
import type { Request, Response } from 'express';
import { smartMoneyService, SMART_MONEY_LIST } from '../../services/smartmoney/SmartMoneyService.js';

export const smartMoneyRoutes = Router();

// GET /v1/smart-money/wallets — list of tracked wallets
smartMoneyRoutes.get('/wallets', (_req: Request, res: Response) => {
  res.json({ success: true, data: { wallets: SMART_MONEY_LIST } });
});

// GET /v1/smart-money/activity — recent moves by smart money wallets
smartMoneyRoutes.get('/activity', async (req: Request, res: Response) => {
  const chain    = typeof req.query.chain    === 'string' ? req.query.chain    : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category as any : undefined;
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
      moves: result.moves,
      total: result.total,
      has_more: result.moves.length === limit,
      cursor: nextCursor,
    },
  });
});
