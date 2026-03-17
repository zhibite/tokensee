'use client';

import { useState, useEffect, useCallback } from 'react';
import { NavBar } from '@/components/NavBar';
import { getIntelligence, type IntelligenceEvent } from '@/lib/api';
import Link from 'next/link';

const CATEGORIES = ['All', 'Security', 'Market', 'Smart Money', 'DeFi', 'Bridge'];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-950/60 border-red-900/60 text-red-400',
  warning:  'bg-amber-950/40 border-amber-900/50 text-amber-400',
  info:     'bg-zinc-900/60 border-zinc-800/60 text-zinc-400',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-amber-500',
  info:     'bg-zinc-500',
};

const CATEGORY_BADGE: Record<string, string> = {
  Security:      'bg-red-950 text-red-400 border-red-900/50',
  Market:        'bg-amber-950 text-amber-400 border-amber-900/50',
  'Smart Money': 'bg-blue-950 text-blue-400 border-blue-900/50',
  DeFi:          'bg-purple-950 text-purple-400 border-purple-900/50',
  Bridge:        'bg-teal-950 text-teal-400 border-teal-900/50',
};

function formatUsd(v: number | null): string {
  if (!v) return '$0';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export default function IntelligencePage() {
  const [events, setEvents]     = useState<IntelligenceEvent[]>([]);
  const [stats, setStats]       = useState({ events_today: 0, critical_alerts: 0, smart_money_signals: 0, volume_flagged: 0 });
  const [category, setCategory] = useState('All');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [cursor, setCursor]     = useState<string | null>(null);
  const [hasMore, setHasMore]   = useState(false);

  const load = useCallback(async (cat: string, cur?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getIntelligence({
        category: cat === 'All' ? undefined : cat,
        limit: 30,
        cursor: cur,
      });
      if (res.success && res.data) {
        setEvents((prev) => cur ? [...prev, ...res.data!.events] : res.data!.events);
        setStats(res.data.stats);
        setCursor(res.data.cursor);
        setHasMore(res.data.has_more);
      }
    } catch {
      setError('Unable to connect to backend. Make sure the server is running on port 6000.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
    const interval = setInterval(() => load(category), 30_000);
    return () => clearInterval(interval);
  }, [category, load]);

  const handleCategory = (cat: string) => {
    setCategory(cat);
    setEvents([]);
    setCursor(null);
    load(cat);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-500 font-medium tracking-wide uppercase">Live Feed</span>
            </div>
            <h1 className="text-2xl font-semibold text-zinc-100">Intelligence</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Entity-aware signals with narrative interpretation · 7 chains · refreshes every 30s
            </p>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {CATEGORIES.map((f) => (
              <button
                key={f}
                onClick={() => handleCategory(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  f === category
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Events today',        value: stats.events_today.toLocaleString(),     sub: 'labeled transfers' },
            { label: 'Critical alerts',     value: String(stats.critical_alerts),           sub: 'hacker · sanctioned · mixer' },
            { label: 'Smart money signals', value: String(stats.smart_money_signals),       sub: 'fund & KOL activity' },
            { label: 'Volume flagged',      value: formatUsd(stats.volume_flagged),         sub: 'in monitored flows' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-xl font-semibold text-zinc-100 mt-0.5">{s.value}</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Event feed */}
        {error ? (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-5 py-8 text-center">
            <p className="text-sm text-red-400 font-medium">Backend unavailable</p>
            <p className="text-xs text-zinc-500 mt-1">{error}</p>
            <button onClick={() => load(category)} className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline">
              Retry
            </button>
          </div>
        ) : loading && events.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 px-5 py-4 animate-pulse bg-zinc-900/40 h-24" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 px-5 py-12 text-center">
            <p className="text-sm text-zinc-500">No classified events found for this filter.</p>
            <p className="text-xs text-zinc-600 mt-1">Events appear once whale alerts have entity labels attached.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className={`rounded-lg border px-5 py-4 ${SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[event.severity] ?? 'bg-zinc-500'}`} />

                    <div className="min-w-0">
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[event.category] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                          {event.category}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900/60 border border-zinc-800 text-zinc-500">
                          {event.chain}
                        </span>
                        <span className="text-[11px] text-zinc-600">{timeAgo(event.created_at)}</span>
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-zinc-200 mb-1">{event.title}</p>

                      {/* Narrative */}
                      <p className="text-xs text-zinc-400 leading-relaxed">{event.narrative}</p>

                      {/* Entity flow */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] font-medium text-zinc-300 bg-zinc-800/60 px-2 py-0.5 rounded truncate max-w-[160px]">
                          {event.from}
                        </span>
                        <svg width="14" height="8" viewBox="0 0 14 8" fill="none" className="text-zinc-600 shrink-0">
                          <path d="M1 4h12M9 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[11px] font-medium text-zinc-300 bg-zinc-800/60 px-2 py-0.5 rounded truncate max-w-[160px]">
                          {event.to}
                        </span>
                        <span className="text-[11px] font-semibold text-zinc-200 ml-1">
                          {formatUsd(event.amount_usd)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/address/${event.from_address}`}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-700/60 hover:border-zinc-600 px-2.5 py-1 rounded"
                    >
                      View tx
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => load(category, cursor ?? undefined)}
                disabled={loading}
                className="w-full py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-800 hover:border-zinc-700 rounded-lg"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
