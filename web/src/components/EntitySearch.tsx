'use client';

import { useState, useCallback } from 'react';
import { getEntityWallets } from '@/lib/api';
import type { EntityWallet } from '@/lib/types';
import { shortenAddress } from '@/lib/utils';

const POPULAR_ENTITIES = [
  'Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit',
  'Uniswap', 'Aave', 'Compound', 'MakerDAO', 'Curve',
  'Jump Trading', 'Wintermute', 'Cumberland', 'GSR Markets',
];

const ENTITY_TYPE_ICON: Record<string, string> = {
  exchange: '🏦',
  bridge:   '🌉',
  fund:     '🏛',
  protocol: '⚡',
  mixer:    '🌀',
  dao:      '🗳',
  whale:    '🐋',
};

export function EntitySearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    entity_name: string;
    entity_type: string;
    wallet_count: number;
    wallets: EntityWallet[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await getEntityWallets(trimmed);
      if (res.success) {
        setResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Unable to connect to backend.');
    } finally {
      setLoading(false);
    }

  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Entity name — e.g. Binance, Uniswap, Jump Trading…"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                     text-zinc-200 placeholder:text-zinc-600 outline-none
                     focus:border-zinc-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40
                     text-sm font-medium text-white transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Popular shortcuts */}
      <div>
        <p className="text-[11px] text-zinc-600 uppercase tracking-widest mb-2">Popular entities</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_ENTITIES.map((name) => (
            <button
              key={name}
              onClick={() => search(name)}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900
                         text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700
                         transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-5 py-4">
          <p className="text-red-400 text-sm font-medium mb-1">Not found</p>
          <p className="text-red-500/70 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Entity header */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-2xl">
              {ENTITY_TYPE_ICON[result.entity_type] ?? '🏷'}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">{result.entity_name}</h2>
              <p className="text-sm text-zinc-500 capitalize">
                {result.entity_type} · {result.wallet_count} wallet{result.wallet_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Wallet table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Label</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Address</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Tags</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {result.wallets.map((w) => (
                  <tr key={w.address} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 text-zinc-200 font-medium">{w.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/address/${w.address}`}
                          className="font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                          title={w.address}
                        >
                          {shortenAddress(w.address)}
                        </a>
                        <button
                          onClick={() => navigator.clipboard.writeText(w.address)}
                          className="text-zinc-600 hover:text-zinc-400 transition-colors text-[11px]"
                          title="Copy address"
                        >
                          ⎘
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {w.tags.length > 0 ? w.tags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700/60 text-zinc-400 border border-zinc-700">
                            {tag}
                          </span>
                        )) : <span className="text-zinc-700 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        w.source === 'static'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'bg-zinc-700/50 text-zinc-400 border border-zinc-700'
                      }`}>
                        {w.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
