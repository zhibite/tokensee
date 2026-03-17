'use client';

import { useState, useEffect, useCallback } from 'react';
import { getActivity } from '@/lib/api';
import type { ActivityItem } from '@/lib/types';
import { shortenHash, formatTimestamp, CHAIN_EXPLORERS, TYPE_LABELS, PROTOCOL_LABELS } from '@/lib/utils';

const TX_TYPE_COLORS: Record<string, string> = {
  swap:                'bg-violet-500/15 text-violet-400 border-violet-500/30',
  transfer:            'bg-zinc-700/50 text-zinc-300 border-zinc-600',
  liquidity_add:       'bg-green-500/15 text-green-400 border-green-500/30',
  liquidity_remove:    'bg-red-500/15 text-red-400 border-red-500/30',
  borrow:              'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  repay:               'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contract_interaction:'bg-zinc-700/50 text-zinc-400 border-zinc-600',
  unknown:             'bg-zinc-800/60 text-zinc-500 border-zinc-700',
};

interface Props {
  address: string;
}

export function AddressActivity({ address }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (append = false, nextCursor?: string) => {
    try {
      const res = await getActivity(address, { limit: 20, cursor: nextCursor });
      if (res.success) {
        setItems((prev) => append ? [...prev, ...res.data.items] : res.data.items);
        setCursor(res.data.cursor);
        setHasMore(res.data.has_more);
      }
    } catch { /* backend unavailable */ }
    finally { setLoading(false); setLoadingMore(false); }
  }, [address]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setCursor(null);
    load(false);
  }, [load]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    load(true, cursor);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-900 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
        <p className="text-zinc-400 text-sm font-medium mb-1">No transactions found</p>
        <p className="text-zinc-600 text-xs">
          Decoded transactions are stored when you use the Decode tool above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ActivityRow key={`${item.hash}-${item.chain}`} item={item} />
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-2.5 rounded-xl border border-zinc-800 text-xs text-zinc-500
                     hover:text-zinc-300 hover:border-zinc-700 transition-colors disabled:opacity-40"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const explorer = CHAIN_EXPLORERS[item.chain] ?? 'https://etherscan.io';
  const typeColor = TX_TYPE_COLORS[item.type] ?? TX_TYPE_COLORS.unknown;
  const typeLabel = TYPE_LABELS[item.type] ?? item.type;

  const hasAssets = item.assets_in.length > 0 || item.assets_out.length > 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Row 1: type badge + protocol + time */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${typeColor}`}>
              {typeLabel}
            </span>
            {item.protocol && (
              <span className="text-[11px] text-zinc-500">
                {PROTOCOL_LABELS[item.protocol] ?? item.protocol}
              </span>
            )}
            <span className="text-[11px] text-zinc-600 ml-auto">{formatTimestamp(item.timestamp)}</span>
          </div>

          {/* Row 2: summary */}
          <p className="text-sm text-zinc-300 truncate">{item.summary}</p>

          {/* Row 3: assets */}
          {hasAssets && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {item.assets_in.map((a, i) => (
                <AssetChip key={i} asset={a} direction="in" />
              ))}
              {item.assets_out.map((a, i) => (
                <AssetChip key={i} asset={a} direction="out" />
              ))}
            </div>
          )}
        </div>

        {/* Right: hash + fee */}
        <div className="text-right shrink-0">
          <a
            href={`${explorer}/tx/${item.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {shortenHash(item.hash)} ↗
          </a>
          {item.fee_usd && (
            <div className="text-[11px] text-zinc-600 mt-0.5">
              fee ${parseFloat(item.fee_usd).toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetChip({
  asset,
  direction,
}: {
  asset: { symbol: string; amount: string; amount_usd?: string };
  direction: 'in' | 'out';
}) {
  const sign = direction === 'in' ? '+' : '-';
  const color = direction === 'in' ? 'text-green-400' : 'text-red-400';
  const n = parseFloat(asset.amount);
  const formatted = isNaN(n) ? asset.amount : n >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : n.toPrecision(5).replace(/\.?0+$/, '');

  return (
    <span className={`text-[11px] font-mono ${color}`}>
      {sign}{formatted} {asset.symbol}
    </span>
  );
}
