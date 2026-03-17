import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { getStats } from '@/lib/api';
import { CHAIN_LABELS } from '@/lib/utils';
import type { StatsData } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Dashboard · TokenSee',
  description: 'Real-time on-chain activity stats — whale volume, chain distribution, top assets.',
};

export const revalidate = 60;

const ALERT_TYPE_LABELS: Record<string, string> = {
  large_transfer:    'Large Transfer',
  exchange_inflow:   'Exchange Inflow',
  exchange_outflow:  'Exchange Outflow',
  whale_movement:    'Whale Movement',
  bridge_deposit:    'Bridge Deposit',
  bridge_withdrawal: 'Bridge Withdrawal',
};

const CHAIN_COLOR: Record<string, string> = {
  ethereum:  'bg-blue-400',
  bsc:       'bg-yellow-400',
  arbitrum:  'bg-sky-400',
  polygon:   'bg-purple-400',
  base:      'bg-indigo-400',
  optimism:  'bg-red-400',
  avalanche: 'bg-rose-400',
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function BarChart({ items, maxVal, colorFn, labelFn }: {
  items: Array<{ key: string; count: number; volume: number }>;
  maxVal: number;
  colorFn: (key: string) => string;
  labelFn: (key: string) => string;
}) {
  return (
    <div className="space-y-2.5">
      {items.map(({ key, count, volume }) => {
        const pct = maxVal > 0 ? Math.max((volume / maxVal) * 100, 2) : 2;
        return (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-300 font-medium">{labelFn(key)}</span>
              <span className="text-zinc-500 tabular-nums">{fmtUsd(volume)} · {count} alerts</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${colorFn(key)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

function DashboardContent({ data, window: w }: { data: StatsData; window: string }) {
  const chainMax  = Math.max(...data.by_chain.map((c) => c.volume_usd), 1);
  const typeMax   = Math.max(...data.by_type.map((t)  => t.volume_usd), 1);
  const assetMax  = Math.max(...data.top_assets.map((a) => a.volume_usd), 1);

  const windowLabel = w === '1h' ? 'last hour' : w === '7d' ? 'last 7 days' : 'last 24 hours';

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label={`Alerts (${windowLabel})`}
          value={data.total_alerts.toLocaleString()}
        />
        <StatCard
          label="Total Volume"
          value={fmtUsd(data.total_volume_usd)}
        />
        <StatCard
          label="Top Chain"
          value={data.by_chain[0] ? (CHAIN_LABELS[data.by_chain[0].chain] ?? data.by_chain[0].chain) : '—'}
          sub={data.by_chain[0] ? fmtUsd(data.by_chain[0].volume_usd) : undefined}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By chain */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Volume by Chain</h3>
          {data.by_chain.length === 0 ? (
            <p className="text-zinc-600 text-sm">No data yet</p>
          ) : (
            <BarChart
              items={data.by_chain.map((c) => ({ key: c.chain, count: c.count, volume: c.volume_usd }))}
              maxVal={chainMax}
              colorFn={(k) => CHAIN_COLOR[k] ?? 'bg-zinc-500'}
              labelFn={(k) => CHAIN_LABELS[k] ?? k}
            />
          )}
        </div>

        {/* By type */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Volume by Alert Type</h3>
          {data.by_type.length === 0 ? (
            <p className="text-zinc-600 text-sm">No data yet</p>
          ) : (
            <BarChart
              items={data.by_type.map((t) => ({ key: t.type, count: t.count, volume: t.volume_usd }))}
              maxVal={typeMax}
              colorFn={() => 'bg-violet-400'}
              labelFn={(k) => ALERT_TYPE_LABELS[k] ?? k}
            />
          )}
        </div>
      </div>

      {/* Top assets */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Top Assets by Volume</h3>
        {data.top_assets.length === 0 ? (
          <p className="text-zinc-600 text-sm">No data yet</p>
        ) : (
          <div className="space-y-2">
            {data.top_assets.map((a, idx) => (
              <div key={a.symbol} className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-600 w-5 text-right tabular-nums">{idx + 1}</span>
                <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-zinc-400">{a.symbol.slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-200 font-medium">{a.symbol}</span>
                    <span className="text-zinc-500 tabular-nums">{fmtUsd(a.volume_usd)}</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.max((a.volume_usd / assetMax) * 100, 2)}%` }}
                    />
                  </div>
                </div>
                <span className="text-[11px] text-zinc-600 w-16 text-right tabular-nums">{a.count} txs</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MEV note */}
      <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-5 py-4">
        <p className="text-xs text-zinc-600">
          Stats aggregate whale alert data from 7 chains.
          Transactions decoded via the API are also classified for MEV patterns
          (flashloans, arbitrage, sandwich bots) — visible in individual tx decode results.
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window: w = '24h' } = await searchParams;
  const validWindow = ['1h', '24h', '7d'].includes(w) ? (w as '1h' | '24h' | '7d') : '24h';

  const res = await getStats(validWindow);

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Analytics</p>
            <h1 className="text-2xl font-bold text-white mb-2">On-Chain Dashboard</h1>
            <p className="text-zinc-500 text-sm">
              Whale activity aggregated across 7 chains in real time.
            </p>
          </div>
          {/* Window selector */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 shrink-0">
            {(['1h', '24h', '7d'] as const).map((opt) => (
              <a
                key={opt}
                href={`/dashboard?window=${opt}`}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  validWindow === opt
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt}
              </a>
            ))}
          </div>
        </div>

        {res.success ? (
          <DashboardContent data={res.data} window={validWindow} />
        ) : (
          <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4">
            <p className="text-red-400 text-sm font-semibold mb-1">Failed to load stats</p>
            <p className="text-red-700 text-xs">{res.error.message}</p>
            <p className="text-red-900 text-xs mt-2">
              Stats require whale alert data in the database. Start the WhaleMonitor and wait for events.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
