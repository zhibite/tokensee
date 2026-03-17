'use client';

import { useState, useEffect } from 'react';
import { NavBar } from '@/components/NavBar';
import {
  getSecuritySummary, getSecurityHackers, getSecurityMixers, getSecuritySanctioned,
  type HackerEvent, type MixerStat,
} from '@/lib/api';
import Link from 'next/link';

function formatUsd(v: number): string {
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

export default function SecurityPage() {
  const [summary, setSummary]     = useState({ hacker_active: 0, sanctioned_total: 83, sanctioned_activity: 0, mixer_inflow_24h: 0, mixer_change_pct: 0 });
  const [hackers, setHackers]     = useState<HackerEvent[]>([]);
  const [mixers, setMixers]       = useState<MixerStat[]>([]);
  const [sanctioned, setSanctioned] = useState<unknown[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, h, m, sa] = await Promise.all([
          getSecuritySummary(),
          getSecurityHackers({ limit: 20, days: 7 }),
          getSecurityMixers(),
          getSecuritySanctioned({ limit: 10 }),
        ]);
        if (s.success && s.data)   setSummary(s.data);
        if (h.success && h.data)   setHackers(h.data.events);
        if (m.success && m.data)   setMixers(m.data.mixers);
        if (sa.success && sa.data) setSanctioned(sa.data.events);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Unable to connect to backend. ${msg}`);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const mixerChangeClass = summary.mixer_change_pct > 0 ? 'text-amber-500' : 'text-green-400';
  const mixerChangeStr   = `${summary.mixer_change_pct > 0 ? '↑' : '↓'} ${Math.abs(summary.mixer_change_pct).toFixed(0)}% vs yesterday`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-100">Security Wall</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Monitor hacker wallets, OFAC-sanctioned addresses, and mixer inflows in real time
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 mb-6 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Status cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Active Hackers</span>
              {summary.hacker_active > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
            <p className="text-3xl font-semibold text-zinc-100">
              {loading ? '–' : summary.hacker_active}
            </p>
            <p className="text-xs text-zinc-500 mt-1">moving funds in last 24h</p>
          </div>

          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">Sanctioned</span>
              <span className="text-xs text-zinc-600">OFAC SDN</span>
            </div>
            <p className="text-3xl font-semibold text-zinc-100">
              {loading ? '–' : summary.sanctioned_total}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              monitored · {summary.sanctioned_activity > 0
                ? <span className="text-red-400">{summary.sanctioned_activity} active (7d)</span>
                : '0 active this week'}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Mixer Inflow 24h</span>
            </div>
            <p className="text-3xl font-semibold text-zinc-100">
              {loading ? '–' : formatUsd(summary.mixer_inflow_24h)}
            </p>
            {!loading && (
              <p className={`text-xs mt-1 font-medium ${mixerChangeClass}`}>{mixerChangeStr}</p>
            )}
          </div>
        </div>

        {/* Hacker address activity */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
            Hacker Address Activity — Last 7 days
          </h2>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-600 animate-pulse">Loading…</div>
            ) : hackers.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-green-500 font-medium">No hacker activity in the past 7 days</p>
                <p className="text-xs text-zinc-600 mt-1">Monitoring {summary.sanctioned_total}+ known threat addresses</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60">
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Address / Label</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Chain</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Last Activity</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Destination</th>
                    <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Amount</th>
                    <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {hackers.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30">
                      <td className="px-4 py-3 font-medium text-zinc-300">
                        <Link href={`/address/${row.address}`} className="hover:text-zinc-100 transition-colors">
                          {row.entity ?? row.label ?? `${row.address.slice(0, 8)}…`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500 uppercase">{row.chain}</td>
                      <td className="px-4 py-3 text-zinc-500">{timeAgo(row.last_activity)}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {row.dest_entity ?? row.dest_label ?? `${row.dest_address.slice(0, 8)}…`}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-200">
                        {formatUsd(row.amount_usd)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`https://etherscan.io/tx/${row.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-600 hover:text-zinc-400 transition-colors font-mono"
                        >
                          ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Mixer inflow */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
            Mixer Inflow — 24h
          </h2>
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 h-20 animate-pulse" />
              ))}
            </div>
          ) : mixers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 px-5 py-6 text-center">
              <p className="text-sm text-zinc-500">No mixer activity detected in the past 24 hours</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {mixers.map((m) => (
                <div key={m.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="text-xs text-zinc-500 mb-2">{m.name}</p>
                  <p className="text-lg font-semibold text-zinc-200">{formatUsd(m.inflow_24h)}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-xs font-medium ${m.change_pct > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {m.change_pct > 0 ? '↑' : '↓'} {Math.abs(m.change_pct).toFixed(0)}% vs yesterday
                    </p>
                    <p className="text-xs text-zinc-600">{m.tx_count} txns</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sanctioned addresses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              OFAC Sanctioned — Recent Activity
            </h2>
            <span className="text-xs text-zinc-600">
              {summary.sanctioned_total} addresses monitored
            </span>
          </div>
          {loading ? (
            <div className="rounded-lg border border-zinc-800 h-16 animate-pulse bg-zinc-900/40" />
          ) : sanctioned.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 px-5 py-6 text-center">
              <p className="text-sm text-green-500 font-medium">No sanctioned address activity in the past 30 days</p>
              <p className="text-xs text-zinc-600 mt-1">
                Monitoring {summary.sanctioned_total} OFAC SDN addresses across ETH · BSC · ARB · POLYGON · BASE · OP · AVAX
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-5 py-4">
              <p className="text-sm text-red-400 font-medium mb-2">⚠️ {sanctioned.length} sanctioned address transactions detected</p>
              <p className="text-xs text-zinc-500">Check the Intelligence feed for details.</p>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
