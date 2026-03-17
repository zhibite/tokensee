'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { SmartMoneyFeed } from './SmartMoneyFeed';
import { getSmartMoneyWallets, getSmartMoneyStats } from '@/lib/api';
import type { SmartMoneyWalletWithActivity, SmartMoneyCategory, SmartMoneyCategoryStat } from '@/lib/types';

const WALLETS_PAGE_SIZE = 50;

type TabId = 'activity' | 'wallets' | 'stats';

const CATEGORY_LABELS: Record<SmartMoneyCategory, string> = {
  vc:           'VC Fund',
  quant:        'Quant Fund',
  market_maker: 'Market Maker',
  whale:        'Whale',
  dao_treasury: 'DAO Treasury',
};

const CATEGORY_COLORS: Record<SmartMoneyCategory, string> = {
  vc:            'bg-violet-500/20 text-violet-300 border-violet-500/30',
  quant:         'bg-blue-500/20 text-blue-300 border-blue-500/30',
  market_maker:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  whale:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  dao_treasury:  'bg-green-500/20 text-green-300 border-green-500/30',
};

const CATEGORY_BAR_COLORS: Record<SmartMoneyCategory, string> = {
  vc:            'bg-violet-500',
  quant:         'bg-blue-500',
  market_maker:  'bg-cyan-500',
  whale:         'bg-amber-500',
  dao_treasury:  'bg-green-500',
};

function formatUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Wallets Tab ───────────────────────────────────────────────────────────────

function WalletsTab() {
  const [wallets, setWallets] = useState<SmartMoneyWalletWithActivity[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<SmartMoneyCategory | 'all'>('all');
  const [page, setPage]       = useState(1);

  const totalPages = Math.max(1, Math.ceil(total / WALLETS_PAGE_SIZE));

  const load = useCallback(async (category: SmartMoneyCategory | 'all', p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSmartMoneyWallets({
        category: category !== 'all' ? category : undefined,
        limit:  WALLETS_PAGE_SIZE,
        offset: (p - 1) * WALLETS_PAGE_SIZE,
      });
      if (!res.success) { setError('Failed to load wallets'); return; }
      setWallets(res.data.wallets);
      setTotal(res.data.total);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load(filter, 1);
  }, [filter, load]);

  useEffect(() => {
    load(filter, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const categories: Array<SmartMoneyCategory | 'all'> = ['all', 'vc', 'quant', 'market_maker', 'whale', 'dao_treasury'];

  // Build compact page number list: always show first, last, current ±1
  const pageNums = (() => {
    const s = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
    return [...s].sort((a, b) => a - b);
  })();

  return (
    <div>
      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === c
                ? 'bg-white text-black border-white'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-xs text-zinc-600 self-center tabular-nums">
            {total.toLocaleString()} wallets
          </span>
        )}
      </div>

      {/* Wallet list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-zinc-500 text-sm">{error}</div>
      ) : wallets.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No wallets found.</div>
      ) : (
        <div className="space-y-2">
          {wallets.map((w, i) => (
            <div
              key={`${w.address}-${i}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${CATEGORY_COLORS[w.category]}`}>
                  {CATEGORY_LABELS[w.category]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{w.name}</p>
                  <p className="text-xs font-mono text-zinc-500 truncate">{w.address}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white">{w.activity_30d}</p>
                <p className="text-xs text-zinc-500">txns / 30d</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ←
          </button>

          {pageNums.map((n, idx) => (
            <Fragment key={n}>
              {idx > 0 && pageNums[idx - 1] !== n - 1 && (
                <span className="px-1 text-zinc-700 text-xs">…</span>
              )}
              <button
                onClick={() => setPage(n)}
                disabled={loading}
                className={`min-w-[2rem] px-2.5 py-1.5 text-xs rounded-md border transition-colors disabled:cursor-not-allowed ${
                  page === n
                    ? 'bg-white text-black border-white font-semibold'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                }`}
              >
                {n}
              </button>
            </Fragment>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>

          <span className="ml-2 text-xs text-zinc-600 tabular-nums">
            {page} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats]     = useState<Record<string, SmartMoneyCategoryStat> | null>(null);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    getSmartMoneyStats()
      .then((res) => {
        if (!res.success) { setError('Failed to load stats'); return; }
        setStats(res.data.by_category);
        setTotal(res.data.total_wallets);
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return <div className="py-12 text-center text-zinc-500 text-sm">{error}</div>;
  if (!stats) return null;

  const categories: SmartMoneyCategory[] = ['vc', 'quant', 'market_maker', 'whale', 'dao_treasury'];
  const maxVolume = Math.max(...categories.map((c) => stats[c]?.volume_usd ?? 0), 1);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Tracked Wallets</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Total Volume (30d)</p>
          <p className="text-2xl font-bold text-white">
            {formatUsd(categories.reduce((s, c) => s + (stats[c]?.volume_usd ?? 0), 0))}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Total Moves (30d)</p>
          <p className="text-2xl font-bold text-white">
            {categories.reduce((s, c) => s + (stats[c]?.count ?? 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Per-category breakdown */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Volume by Category (30d)</h3>
        <div className="space-y-3">
          {categories.map((cat) => {
            const s = stats[cat];
            const vol = s?.volume_usd ?? 0;
            const pct = maxVolume > 0 ? (vol / maxVolume) * 100 : 0;
            return (
              <div key={cat}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[cat]}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-white">{formatUsd(vol)}</span>
                    <span className="text-xs text-zinc-500 ml-2">{(s?.count ?? 0).toLocaleString()} moves</span>
                  </div>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${CATEGORY_BAR_COLORS[cat]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SmartMoneyTabs (main export) ──────────────────────────────────────────────

export function SmartMoneyTabs() {
  const [active, setActive] = useState<TabId>('activity');

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'activity', label: 'Activity Feed' },
    { id: 'wallets',  label: 'Tracked Wallets' },
    { id: 'stats',    label: 'Stats' },
  ];

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === t.id
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'activity' && <SmartMoneyFeed />}
      {active === 'wallets'  && <WalletsTab />}
      {active === 'stats'    && <StatsTab />}
    </div>
  );
}
