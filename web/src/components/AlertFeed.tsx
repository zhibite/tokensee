'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAlerts } from '@/lib/api';
import type { WhaleAlert, AlertType } from '@/lib/types';
import { shortenAddress, formatTimestamp } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  large_transfer:    'Transfer',
  exchange_inflow:   'Exchange Inflow',
  exchange_outflow:  'Exchange Outflow',
  whale_movement:    'Whale Move',
  bridge_deposit:    'Bridge Deposit',
  bridge_withdrawal: 'Bridge Withdrawal',
};

const ALERT_TYPE_COLORS: Record<AlertType, string> = {
  large_transfer:    'bg-zinc-700/50 text-zinc-300 border-zinc-600',
  exchange_inflow:   'bg-red-500/15 text-red-400 border-red-500/30',
  exchange_outflow:  'bg-green-500/15 text-green-400 border-green-500/30',
  whale_movement:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  bridge_deposit:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  bridge_withdrawal: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

const CHAIN_OPTIONS = [
  { value: '', label: 'All Chains' },
  { value: 'ethereum',  label: 'Ethereum' },
  { value: 'bsc',       label: 'BNB Chain' },
  { value: 'arbitrum',  label: 'Arbitrum' },
  { value: 'polygon',   label: 'Polygon' },
  { value: 'base',      label: 'Base' },
  { value: 'optimism',  label: 'Optimism' },
  { value: 'avalanche', label: 'Avalanche' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'exchange_inflow',   label: 'Exchange Inflow' },
  { value: 'exchange_outflow',  label: 'Exchange Outflow' },
  { value: 'whale_movement',    label: 'Whale Move' },
  { value: 'bridge_deposit',    label: 'Bridge Deposit' },
  { value: 'bridge_withdrawal', label: 'Bridge Withdrawal' },
  { value: 'large_transfer',    label: 'Large Transfer' },
];

const MIN_USD_OPTIONS = [
  { value: 100_000,  label: '$100K+' },
  { value: 500_000,  label: '$500K+' },
  { value: 1_000_000, label: '$1M+' },
  { value: 10_000_000, label: '$10M+' },
];

interface Stats {
  count: number;
  totalUsd: number;
  byChain: Record<string, number>;
  byType: Record<string, number>;
}

function computeStats(alerts: WhaleAlert[]): Stats {
  const stats: Stats = { count: alerts.length, totalUsd: 0, byChain: {}, byType: {} };
  for (const a of alerts) {
    stats.totalUsd += a.amount_usd ?? 0;
    stats.byChain[a.chain] = (stats.byChain[a.chain] ?? 0) + 1;
    stats.byType[a.alert_type] = (stats.byType[a.alert_type] ?? 0) + 1;
  }
  return stats;
}

export function AlertFeed() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [chain, setChain] = useState('');
  const [type, setType] = useState('');
  const [minUsd, setMinUsd] = useState(100_000);
  const esRef = useRef<EventSource | null>(null);
  const stats = computeStats(alerts);

  // Initial load from REST (history)
  const load = useCallback(async () => {
    const res = await getAlerts({
      chain: chain || undefined,
      type: type || undefined,
      min_usd: minUsd,
      limit: 50,
    });
    if (res.success) setAlerts(res.data.items);
    setLoading(false);
  }, [chain, type, minUsd]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // SSE connection for real-time new alerts
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/v1/alerts/stream`);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));

    es.addEventListener('alert', (e) => {
      try {
        const raw = JSON.parse(e.data);
        // Map raw DB shape → WhaleAlert frontend shape
        const alert: WhaleAlert = {
          id: raw.id,
          tx_hash: raw.tx_hash,
          chain: raw.chain,
          block_number: Number(raw.block_number),
          timestamp: raw.timestamp,
          from: { address: raw.from_address, label: raw.from_label, entity: raw.from_entity, type: raw.from_type },
          to:   { address: raw.to_address,   label: raw.to_label,   entity: raw.to_entity,   type: raw.to_type   },
          asset: { address: raw.asset_address, symbol: raw.asset_symbol },
          amount: raw.amount,
          amount_usd: raw.amount_usd,
          alert_type: raw.alert_type,
          created_at: raw.created_at,
        };
        // Apply client-side filters before prepending
        if (chain && alert.chain !== chain) return;
        if (type  && alert.alert_type !== type) return;
        if (alert.amount_usd !== null && alert.amount_usd < minUsd) return;
        setAlerts((prev) => [alert, ...prev].slice(0, 100));
      } catch { /* ignore parse errors */ }
    });

    es.onerror = () => setConnected(false);

    return () => { es.close(); esRef.current = null; setConnected(false); };
  }, []);  // single persistent connection — filters applied client-side

  const formatUsdCompact = (n: number) =>
    n >= 1_000_000_000 ? `$${(n / 1_000_000_000).toFixed(1)}B`
    : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`;

  const topChain = Object.entries(stats.byChain).sort((a, b) => b[1] - a[1])[0];
  const topType  = Object.entries(stats.byType).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {!loading && alerts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Alerts loaded" value={String(stats.count)} />
          <StatCard label="Total volume" value={formatUsdCompact(stats.totalUsd)} />
          <StatCard
            label="Top chain"
            value={topChain ? CHAIN_BADGE[topChain[0]]?.label ?? topChain[0].toUpperCase() : '—'}
            sub={topChain ? `${topChain[1]} alerts` : undefined}
          />
          <StatCard
            label="Top type"
            value={topType ? ALERT_TYPE_LABELS[topType[0] as AlertType] ?? topType[0] : '—'}
            sub={topType ? `${topType[1]} alerts` : undefined}
          />
        </div>
      )}

      {/* Filters + live indicator */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={chain} onChange={setChain} options={CHAIN_OPTIONS} />
        <FilterSelect value={type} onChange={setType} options={TYPE_OPTIONS} />
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {MIN_USD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMinUsd(opt.value)}
              className={`px-3 py-2 transition-colors ${
                minUsd === opt.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Live / reconnecting badge */}
        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className={connected ? 'text-green-400' : 'text-zinc-600'}>
            {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertRow key={`${alert.tx_hash}-${alert.asset.address}`} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: WhaleAlert }) {
  const explorerBase = alert.chain === 'ethereum' ? 'https://etherscan.io' : 'https://bscscan.com';
  const colors = ALERT_TYPE_COLORS[alert.alert_type] ?? ALERT_TYPE_COLORS.large_transfer;

  const formatUsd = (usd: number) =>
    usd >= 1_000_000
      ? `$${(usd / 1_000_000).toFixed(2)}M`
      : `$${(usd / 1_000).toFixed(0)}K`;

  const formatAmount = (amount: string, symbol: string) => {
    const n = parseFloat(amount);
    return n >= 1000
      ? `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${symbol}`
      : `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`;
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Left: type + parties */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colors}`}>
              {ALERT_TYPE_LABELS[alert.alert_type]}
            </span>
            <ChainBadge chain={alert.chain} />
            <span className="text-[11px] text-zinc-600">{formatTimestamp(alert.timestamp)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <Party party={alert.from} explorerBase={explorerBase} />
            <span className="text-zinc-600 shrink-0">→</span>
            <Party party={alert.to} explorerBase={explorerBase} />
          </div>
        </div>

        {/* Right: amount */}
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-white tabular-nums">
            {formatAmount(alert.amount, alert.asset.symbol)}
          </div>
          {alert.amount_usd && (
            <div className="text-xs text-zinc-400 tabular-nums">
              {formatUsd(alert.amount_usd)}
            </div>
          )}
          <a
            href={`${explorerBase}/tx/${alert.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-600 hover:text-zinc-400 font-mono transition-colors"
          >
            {alert.tx_hash.slice(0, 8)}… ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function Party({ party, explorerBase }: { party: WhaleAlert['from']; explorerBase: string }) {
  const label = party.label ?? shortenAddress(party.address);
  const isKnown = !!party.label;

  return (
    <a
      href={`${explorerBase}/address/${party.address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="min-w-0 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      title={party.address}
    >
      {isKnown && (
        <EntityTypeIcon type={party.type} />
      )}
      <span className={`text-xs truncate max-w-[140px] ${isKnown ? 'text-white font-medium' : 'font-mono text-zinc-400'}`}>
        {label}
      </span>
    </a>
  );
}

function EntityTypeIcon({ type }: { type: string | null }) {
  const icons: Record<string, string> = {
    exchange: '🏦',
    bridge:   '🌉',
    fund:     '🏛',
    protocol: '⚡',
    mixer:    '🌀',
    dao:      '🗳',
    whale:    '🐋',
  };
  return <span className="text-xs">{icons[type ?? ''] ?? '🏷'}</span>;
}

const CHAIN_BADGE: Record<string, { label: string; cls: string }> = {
  ethereum:  { label: 'ETH',  cls: 'bg-blue-500/20 text-blue-400' },
  bsc:       { label: 'BSC',  cls: 'bg-yellow-500/20 text-yellow-400' },
  arbitrum:  { label: 'ARB',  cls: 'bg-sky-500/20 text-sky-400' },
  polygon:   { label: 'POL',  cls: 'bg-purple-500/20 text-purple-400' },
  base:      { label: 'BASE', cls: 'bg-indigo-500/20 text-indigo-400' },
  optimism:  { label: 'OP',   cls: 'bg-red-500/20 text-red-400' },
  avalanche: { label: 'AVAX', cls: 'bg-rose-500/20 text-rose-400' },
};

function ChainBadge({ chain }: { chain: string }) {
  const badge = CHAIN_BADGE[chain] ?? { label: chain.toUpperCase(), cls: 'bg-zinc-700/50 text-zinc-400' };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300
                 outline-none focus:border-zinc-500 cursor-pointer appearance-none pr-7
                 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 12 12%22%3E%3Cpath fill=%22%2371717a%22 d=%22M6 8L1 3h10z%22/%3E%3C/svg%3E')]
                 bg-no-repeat bg-[center_right_0.5rem]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-[11px] text-zinc-500 mb-1">{label}</p>
      <p className="text-base font-semibold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
      <div className="text-3xl mb-3">🐋</div>
      <p className="text-zinc-400 text-sm font-medium mb-1">No alerts yet</p>
      <p className="text-zinc-600 text-xs">
        The monitor scans new blocks every 30s. Large transfers will appear here once detected.
      </p>
    </div>
  );
}
