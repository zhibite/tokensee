import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';
import { whaleAlertEmitter } from '../../services/monitor/WhaleMonitor.js';
import type { ApiError } from '../../types/transaction.types.js';

export const alertRoutes = Router();

// GET /v1/alerts/stream — Server-Sent Events real-time whale alert stream
alertRoutes.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial connected message
  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  const onAlert = (alert: unknown) => {
    res.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
  };

  whaleAlertEmitter.on('alert', onAlert);

  // Keep-alive ping every 25s (browser SSE timeout ~30s)
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    whaleAlertEmitter.off('alert', onAlert);
    clearInterval(ping);
  });
});

interface AlertRow {
  id: string;
  tx_hash: string;
  chain: string;
  block_number: string;
  timestamp: string;
  from_address: string;
  from_label: string | null;
  from_entity: string | null;
  from_type: string | null;
  to_address: string;
  to_label: string | null;
  to_entity: string | null;
  to_type: string | null;
  asset_address: string;
  asset_symbol: string;
  amount: string;
  amount_usd: string | null;
  alert_type: string;
  created_at: string;
}

// GET /v1/alerts
// ?chain=ethereum&min_usd=100000&type=exchange_inflow&limit=20&cursor=<id>
alertRoutes.get('/', async (req: Request, res: Response) => {
  const chain     = req.query.chain as string | undefined;
  const alertType = req.query.type  as string | undefined;
  const minUsd    = parseFloat((req.query.min_usd as string) ?? (process.env.WHALE_USD_THRESHOLD ?? '1000000'));
  const limit     = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
  const cursor    = req.query.cursor ? BigInt(req.query.cursor as string) : null;

  const VALID_TYPES = ['large_transfer','exchange_inflow','exchange_outflow','whale_movement','bridge_deposit','bridge_withdrawal'];
  const VALID_CHAINS = ['ethereum','bsc','arbitrum','polygon','base','optimism','avalanche'];

  if (chain && !VALID_CHAINS.includes(chain)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_CHAIN', message: `chain must be one of: ${VALID_CHAINS.join(', ')}` } };
    return res.status(400).json(error);
  }
  if (alertType && !VALID_TYPES.includes(alertType)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_TYPE', message: `type must be one of: ${VALID_TYPES.join(', ')}` } };
    return res.status(400).json(error);
  }

  try {
    const conditions: string[] = ['amount_usd >= $1'];
    const params: unknown[] = [isNaN(minUsd) ? 100_000 : minUsd];
    let idx = 2;

    if (chain) { conditions.push(`chain = $${idx++}`); params.push(chain); }
    if (alertType) { conditions.push(`alert_type = $${idx++}`); params.push(alertType); }
    if (cursor) { conditions.push(`id < $${idx++}`); params.push(cursor.toString()); }

    const where = conditions.join(' AND ');
    params.push(limit + 1); // fetch one extra to detect has_more

    const result = await db.query<AlertRow>(
      `SELECT * FROM whale_alerts WHERE ${where} ORDER BY id DESC LIMIT $${idx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({
      success: true,
      data: {
        items: items.map(formatAlert),
        cursor: nextCursor,
        has_more: hasMore,
      },
    });
  } catch (err) {
    // DB not available — return empty instead of 500
    console.error('[alerts] DB query failed:', (err as Error).message);
    return res.json({ success: true, data: { items: [], cursor: null, has_more: false } });
  }
});

// GET /v1/alerts/stats — summary counts by type
alertRoutes.get('/stats', async (_req: Request, res: Response) => {
  try {
    const result = await db.query<{ alert_type: string; count: string; total_usd: string }>(
      `SELECT alert_type, COUNT(*) as count, SUM(amount_usd) as total_usd
       FROM whale_alerts
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY alert_type
       ORDER BY count DESC`
    );

    return res.json({ success: true, data: result.rows });
  } catch {
    return res.json({ success: true, data: [] });
  }
});

function formatAlert(row: AlertRow) {
  return {
    id: row.id,
    tx_hash: row.tx_hash,
    chain: row.chain,
    block_number: parseInt(row.block_number),
    timestamp: parseInt(row.timestamp),
    from: {
      address: row.from_address,
      label: row.from_label,
      entity: row.from_entity,
      type: row.from_type,
    },
    to: {
      address: row.to_address,
      label: row.to_label,
      entity: row.to_entity,
      type: row.to_type,
    },
    asset: {
      address: row.asset_address,
      symbol: row.asset_symbol,
    },
    amount: row.amount,
    amount_usd: row.amount_usd ? parseFloat(row.amount_usd) : null,
    alert_type: row.alert_type,
    created_at: row.created_at,
  };
}
