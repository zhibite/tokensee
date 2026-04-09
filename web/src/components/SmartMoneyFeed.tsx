'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getSmartMoneyActivity } from '@/lib/api';
import type { SmartMoneyMove, SmartMoneyCategory } from '@/lib/types';

const CATEGORY_LABELS: Record<SmartMoneyCategory, string> = {
  vc: 'VC',
  quant: 'Quant',
  market_maker: 'MM',
  whale: 'Whale',
  dao_treasury: 'DAO',
};

const CATEGORY_COLORS: Record<SmartMoneyCategory, string> = {
  vc:            'bg-violet-500/20 text-violet-300 border-violet-500/30',
  quant:         'bg-blue-500/20 text-blue-300 border-blue-500/30',
  market_maker:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  whale:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  dao_treasury:  'bg-green-500/20 text-green-300 border-green-500/30',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  exchange_inflow:  '→ CEX',
  exchange_outflow: '← CEX',
  bridge_deposit:   '→ Bridge',
  bridge_withdrawal:'← Bridge',
  whale_movement:   'Whale Move',
  large_transfer:   'Transfer',
};

const CHAIN_COLORS: Record<string, string> = {
  ethereum:  'text-blue-400',
  bsc:       'text-yellow-400',
  arbitrum:  'text-orange-400',
  polygon:   'text-purple-400',
  base:      'text-blue-300',
  optimism:  'text-red-400',
  avalanche: 'text-red-500',
  zksync:   'text-indigo-400',
  linea:    'text-violet-400',
  scroll:    'text-amber-300',
  zkevm:    'text-purple-300',
  mantle:   'text-teal-400',
  gnosis:   'text-cyan-400',
  metis:    'text-sky-400',
  boba:     'text-blue-200',
  blast:    'text-yellow-300',
  mode:     'text-indigo-300',
};

function formatUsd(n: number | null) {
  if (!n) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const ALL_CATEGORIES: Array<SmartMoneyCategory | 'all'> = ['all', 'vc', 'quant', 'market_maker', 'whale', 'dao_treasury'];
const ALL_CHAINS = [
  'all',
  'ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche',
  'zksync', 'linea', 'scroll', 'zkevm', 'mantle', 'gnosis', 'metis', 'boba', 'blast', 'mode',
];

export function SmartMoneyFeed() {
  const [moves, setMoves]         = useState<SmartMoneyMove[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [category, setCategory]   = useState<SmartMoneyCategory | 'all'>('all');
  const [chain, setChain]         = useState('all');
  const [hasMore, setHasMore]     = useState(false);
  const [cursor, setCursor]       = useState<string | null>(null);

  const load = useCallback(async (reset = true) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSmartMoneyActivity({
        category: category === 'all' ? undefined : category,
        chain:    chain    === 'all' ? undefined : chain,
        limit: 30,
        cursor: reset ? undefined : (cursor ?? undefined),
      });
      if (!res.success) { setError('Failed to load'); setLoading(false); return; }
      setMoves((prev) => reset ? res.data.moves : [...prev, ...res.data.moves]);
      setHasMore(res.data.has_more);
      setCursor(res.data.cursor);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [category, chain, cursor]);

  useEffect(() => { load(true); }, [category, chain]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* ── Filters ────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-1.5 flex-wrap">
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                category === c
                  ? 'bg-white text-black border-white'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_CHAINS.map((c) => (
            <button
              key={c}
              onClick={() => setChain(c)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                chain === c
                  ? 'bg-white text-black border-white'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {c === 'all' ? 'All chains' : c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed ───────────────────────────────────── */}
      {loading && moves.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-zinc-500 text-sm">{error}</div>
      ) : moves.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-zinc-500 text-sm">No smart money activity found.</p>
          <p className="text-zinc-700 text-xs mt-1">This data comes from whale_alerts — start the server and let it scan some blocks.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {moves.map((m) => (
            <MoveCard key={m.id} move={m} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="mt-4 w-full text-sm text-zinc-500 hover:text-zinc-300 py-3 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

function MoveCard({ move: m }: { move: SmartMoneyMove }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[m.wallet_category]}`}>
              {CATEGORY_LABELS[m.wallet_category]}
            </span>
            <span className="text-sm font-medium text-white">{m.wallet_name}</span>
            <span className="text-xs text-zinc-600">{m.role === 'sender' ? 'sent' : 'received'}</span>
            <span className="text-sm font-semibold text-white">
              {m.amount} {m.asset_symbol}
            </span>
            {m.amount_usd && (
              <span className="text-xs text-zinc-400">({formatUsd(m.amount_usd)})</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
            <span className={`capitalize font-medium ${CHAIN_COLORS[m.chain] ?? 'text-zinc-400'}`}>{m.chain}</span>
            <span>·</span>
            <span>{ALERT_TYPE_LABELS[m.alert_type] ?? m.alert_type}</span>
            {(m.counterpart_entity ?? m.counterpart_label) && (
              <>
                <span>·</span>
                <span>{m.role === 'sender' ? '→' : '←'}</span>
                <Link
                  href={`/address/${m.counterpart_address}`}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {m.counterpart_entity ?? m.counterpart_label ?? m.counterpart_address.slice(0, 8) + '…'}
                </Link>
              </>
            )}
            <span>·</span>
            <a
              href={`https://etherscan.io/tx/${m.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-zinc-300 transition-colors"
            >
              {m.tx_hash.slice(0, 10)}…
            </a>
          </div>
        </div>

        <span className="text-xs text-zinc-600 whitespace-nowrap shrink-0">
          {timeAgo(m.timestamp)}
        </span>
      </div>
    </div>
  );
}
