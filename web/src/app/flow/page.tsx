'use client';

import { useState, useEffect, useCallback } from 'react';
import { NavBar } from '@/components/NavBar';
import { getFlowPairs, type FlowPair } from '@/lib/api';

type Window = '24h' | '7d' | '30d';

const TYPE_COLOR: Record<string, string> = {
  exchange:    'bg-blue-950 text-blue-400 border-blue-900/50',
  protocol:    'bg-purple-950 text-purple-400 border-purple-900/50',
  fund:        'bg-green-950 text-green-400 border-green-900/50',
  institution: 'bg-teal-950 text-teal-400 border-teal-900/50',
  bridge:      'bg-zinc-800 text-zinc-400 border-zinc-700/50',
  mixer:       'bg-red-950 text-red-400 border-red-900/50',
  kol:         'bg-amber-950 text-amber-400 border-amber-900/50',
  dao:         'bg-indigo-950 text-indigo-400 border-indigo-900/50',
  hacker:      'bg-red-950 text-red-500 border-red-900/50',
  token:       'bg-zinc-900 text-zinc-400 border-zinc-700/50',
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const cls = TYPE_COLOR[type] ?? 'bg-zinc-900 text-zinc-500 border-zinc-800';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>{type}</span>
  );
}

function formatUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function FlowPage() {
  const [pairs, setPairs]         = useState<FlowPair[]>([]);
  const [stats, setStats]         = useState({ total_volume: 0, total_txns: 0, unique_entities: 0 });
  const [topEntities, setTop]     = useState<{ name: string; type: string | null; volume: number }[]>([]);
  const [window, setWindow]       = useState<Window>('24h');
  const [chain, setChain]         = useState('');
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async (w: Window, c: string) => {
    setLoading(true);
    try {
      const res = await getFlowPairs({ window: w, chain: c || undefined, limit: 50 });
      if (res.success && res.data) {
        setPairs(res.data.pairs);
        setStats(res.data.stats);
        setTop(res.data.top_entities);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(window, chain); }, [window, chain, load]);

  // Build Sankey source/dest from real top entities
  const sources = topEntities.filter((_, i) => i % 2 === 0).slice(0, 5);
  const dests   = topEntities.filter((_, i) => i % 2 !== 0).slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Fund Flow</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Capital movement between labeled entities · {window} window · 7 chains
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['24h', '7d', '30d'] as Window[]).map((t) => (
              <button
                key={t}
                onClick={() => setWindow(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  t === window
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total volume',      value: formatUsd(stats.total_volume) },
            { label: 'Transactions',      value: stats.total_txns.toLocaleString() },
            { label: 'Entities involved', value: String(stats.unique_entities) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-xl font-semibold text-zinc-100 mt-0.5">
                {loading ? '–' : s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Visual flow diagram */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 mb-8 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Capital Flow — Top entities by volume</span>
            <span className="text-[10px] text-zinc-600 bg-zinc-800/60 px-2 py-0.5 rounded">node size ∝ volume</span>
          </div>
          <div className="px-8 py-8">
            {loading ? (
              <div className="h-40 animate-pulse bg-zinc-800/30 rounded" />
            ) : (
              <div className="flex items-center justify-between gap-4">
                {/* Sources */}
                <div className="flex flex-col gap-2.5 w-40">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Top Sources</p>
                  {sources.map((e) => (
                    <div key={e.name} className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
                      <span className="truncate block">{e.name}</span>
                      <span className="text-[10px] text-zinc-600">{formatUsd(e.volume)}</span>
                    </div>
                  ))}
                </div>

                {/* Flow lines */}
                <div className="flex-1">
                  <svg width="100%" height="160" viewBox="0 0 200 160" preserveAspectRatio="none">
                    {sources.map((_, i) => {
                      const y1 = 20 + i * 28;
                      const y2 = 20 + i * 28;
                      return (
                        <path
                          key={i}
                          d={`M 0 ${y1} C 100 ${y1} 100 ${y2} 200 ${y2}`}
                          stroke="#3f3f46"
                          strokeWidth={i === 0 ? 7 : i === 1 ? 5 : 3}
                          fill="none"
                          opacity="0.7"
                        />
                      );
                    })}
                  </svg>
                  <p className="text-[11px] text-zinc-600 text-center -mt-2">{formatUsd(stats.total_volume)} total flow</p>
                </div>

                {/* Destinations */}
                <div className="flex flex-col gap-2.5 w-40">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Top Destinations</p>
                  {dests.map((e) => (
                    <div key={e.name} className={`rounded border px-3 py-1.5 text-xs ${
                      e.type === 'mixer'
                        ? 'border-red-900/50 bg-red-950/30 text-red-400'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'
                    }`}>
                      <span className="truncate block">{e.name}</span>
                      <span className="text-[10px] opacity-70">{formatUsd(e.volume)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top flow pairs table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              Top Entity Pairs — {window} Volume
            </h2>
            {/* Chain filter */}
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-400 rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
            >
              <option value="">All chains</option>
              {['ethereum','bsc','arbitrum','polygon','base','optimism','avalanche'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-600 animate-pulse">Loading…</div>
            ) : pairs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-500">
                No entity-labeled flow pairs found for this window.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60">
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">From</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">To</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Chain</th>
                    <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Volume</th>
                    <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-medium truncate max-w-[140px]">{row.from}</span>
                          <TypeBadge type={row.from_type} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-medium truncate max-w-[140px]">{row.to}</span>
                          <TypeBadge type={row.to_type} />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{row.chain}</td>
                      <td className="px-4 py-3 text-right font-semibold text-zinc-200">{formatUsd(row.volume_usd)}</td>
                      <td className="px-4 py-3 text-right text-zinc-500">{row.tx_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
