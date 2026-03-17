import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';

export const intelligenceRoutes = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortenAddr(addr: string): string {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Unknown';
}

function formatUsd(v: number | null): string {
  if (!v) return '$0';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

type AlertRow = {
  id: string;
  tx_hash: string;
  chain: string;
  timestamp: number;
  from_address: string;
  from_label: string | null;
  from_entity: string | null;
  from_type: string | null;
  to_address: string;
  to_label: string | null;
  to_entity: string | null;
  to_type: string | null;
  asset_symbol: string;
  amount_usd: number | null;
  alert_type: string;
  created_at: string;
};

function classify(a: AlertRow): {
  category: string; severity: string; title: string; narrative: string;
} {
  const ft = a.from_type;
  const tt = a.to_type;
  const fn = a.from_entity ?? a.from_label ?? shortenAddr(a.from_address);
  const tn = a.to_entity   ?? a.to_label   ?? shortenAddr(a.to_address);
  const amt = formatUsd(a.amount_usd);
  const ch  = a.chain.toUpperCase();

  // Security — hacker moving funds
  if (ft === 'hacker') {
    return {
      category: 'Security', severity: 'critical',
      title: 'Known hacker address activated',
      narrative: `${fn} transferred ${amt} to ${tn} on ${ch}.`,
    };
  }
  // Security — funds into mixer
  if (tt === 'mixer') {
    return {
      category: 'Security', severity: ft === 'hacker' ? 'critical' : 'warning',
      title: 'Funds routed into mixer',
      narrative: `${fn} injected ${amt} into ${tn} on ${ch}.`,
    };
  }
  // Security — sanctioned address
  if (ft === 'sanctioned' || tt === 'sanctioned') {
    const name = ft === 'sanctioned' ? fn : tn;
    return {
      category: 'Security', severity: 'critical',
      title: 'OFAC sanctioned address active',
      narrative: `Sanctioned address ${name} involved in ${amt} transfer on ${ch}.`,
    };
  }
  // Market — large exchange inflow
  if (tt === 'exchange' && (a.amount_usd ?? 0) >= 1_000_000) {
    return {
      category: 'Market', severity: (a.amount_usd ?? 0) >= 10_000_000 ? 'warning' : 'info',
      title: 'Large exchange inflow detected',
      narrative: `${fn} sent ${amt} to ${tn} on ${ch} — potential sell pressure signal.`,
    };
  }
  // Market — large exchange outflow
  if (ft === 'exchange' && (a.amount_usd ?? 0) >= 1_000_000) {
    return {
      category: 'Market', severity: 'info',
      title: 'Large exchange outflow detected',
      narrative: `${tn} withdrew ${amt} from ${fn} on ${ch} — potential accumulation signal.`,
    };
  }
  // Smart Money
  if (ft === 'fund' || ft === 'kol' || tt === 'fund' || tt === 'kol') {
    const smName = (ft === 'fund' || ft === 'kol') ? fn : tn;
    const counterpart = (ft === 'fund' || ft === 'kol') ? tn : fn;
    const verb = (ft === 'fund' || ft === 'kol') ? 'moved' : 'received';
    return {
      category: 'Smart Money', severity: 'info',
      title: `Smart money ${verb} large amount`,
      narrative: `${smName} ${verb} ${amt} ${verb === 'moved' ? 'to' : 'from'} ${counterpart} on ${ch}.`,
    };
  }
  // Bridge
  if (ft === 'bridge' || tt === 'bridge') {
    const bridge = ft === 'bridge' ? fn : tn;
    return {
      category: 'Bridge', severity: 'info',
      title: 'Large bridge activity detected',
      narrative: `${amt} transited through ${bridge} on ${ch}.`,
    };
  }
  // DeFi
  if (ft === 'protocol' || tt === 'protocol') {
    const protocol = ft === 'protocol' ? fn : tn;
    return {
      category: 'DeFi', severity: 'info',
      title: 'Large DeFi protocol interaction',
      narrative: `${amt} interacted with ${protocol} on ${ch}.`,
    };
  }
  // Default
  return {
    category: 'Market', severity: 'info',
    title: 'Large transfer detected',
    narrative: `${fn} sent ${amt} to ${tn} on ${ch}.`,
  };
}

// GET /v1/intelligence — classified event feed derived from whale_alerts
intelligenceRoutes.get('/', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const chain    = typeof req.query.chain    === 'string' ? req.query.chain    : undefined;
  const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
  const limit    = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
  const cursor   = typeof req.query.cursor   === 'string' ? parseInt(req.query.cursor, 10) : undefined;

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Only include alerts that have at least one entity label (makes events more meaningful)
    conditions.push(`(from_type IS NOT NULL OR to_type IS NOT NULL)`);

    if (chain) {
      conditions.push(`chain = $${idx++}`);
      params.push(chain);
    }
    if (cursor) {
      conditions.push(`id < $${idx++}`);
      params.push(cursor);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query<AlertRow>(
      `SELECT id, tx_hash, chain, timestamp,
              from_address, from_label, from_entity, from_type,
              to_address,   to_label,   to_entity,   to_type,
              asset_symbol, amount_usd, alert_type, created_at
       FROM whale_alerts
       ${where}
       ORDER BY id DESC
       LIMIT $${idx}`,
      [...params, limit * 3], // fetch more to allow client-side category filtering
    );

    // Classify and build event objects
    const events = rows.map((a) => {
      const { category: cat, severity: sev, title, narrative } = classify(a);
      return {
        id:        a.id,
        tx_hash:   a.tx_hash,
        chain:     a.chain.toUpperCase(),
        timestamp: typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp,
        created_at: a.created_at,
        category:  cat,
        severity:  sev,
        title,
        narrative,
        from: a.from_entity ?? a.from_label ?? shortenAddr(a.from_address),
        from_address: a.from_address,
        from_type: a.from_type,
        to:   a.to_entity   ?? a.to_label   ?? shortenAddr(a.to_address),
        to_address: a.to_address,
        to_type: a.to_type,
        amount_usd: a.amount_usd != null ? parseFloat(String(a.amount_usd)) : null,
        asset: a.asset_symbol,
      };
    });

    // Apply category / severity filter after classification
    const filtered = events.filter((e) => {
      if (category && category !== 'All' && e.category !== category) return false;
      if (severity  && e.severity !== severity) return false;
      return true;
    }).slice(0, limit);

    // Stats (always from last 24h regardless of pagination)
    const statsRows = await db.query<{
      total: string; critical: string; smart_money: string; volume: string;
    }>(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (WHERE from_type IN ('hacker','sanctioned') OR to_type IN ('mixer','sanctioned')) AS critical,
         COUNT(*) FILTER (WHERE from_type IN ('fund','kol') OR to_type IN ('fund','kol'))                 AS smart_money,
         COALESCE(SUM(amount_usd), 0)                         AS volume
       FROM whale_alerts
       WHERE created_at > NOW() - INTERVAL '24 hours'
         AND (from_type IS NOT NULL OR to_type IS NOT NULL)`,
    );
    const stats = statsRows.rows[0] ?? { total: '0', critical: '0', smart_money: '0', volume: '0' };

    const lastItem = filtered[filtered.length - 1];
    res.json({
      success: true,
      data: {
        events:   filtered,
        has_more: filtered.length === limit,
        cursor:   lastItem ? lastItem.id : null,
        stats: {
          events_today:       parseInt(stats.total, 10),
          critical_alerts:    parseInt(stats.critical, 10),
          smart_money_signals: parseInt(stats.smart_money, 10),
          volume_flagged:     parseFloat(stats.volume),
        },
      },
    });
  } catch (err) {
    console.error('[intelligence] query error', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Query failed' } });
  }
});
