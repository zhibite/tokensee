'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getEntityStats, searchEntities, deleteEntity, addEntity } from '@/lib/api';
import type { EntityRecord, EntityStatsData } from '@/lib/types';
import { shortenAddress } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  'exchange', 'protocol', 'bridge', 'fund', 'institution', 'kol',
  'hacker', 'sanctioned', 'miner', 'token', 'whale', 'mixer', 'nft', 'stablecoin', 'oracle', 'dao', 'other',
];
const CHAINS       = ['ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche', 'multi'];

const TYPE_COLOR: Record<string, string> = {
  exchange:    'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  protocol:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  bridge:      'bg-purple-500/15 text-purple-400 border-purple-500/30',
  fund:        'bg-green-500/15 text-green-400 border-green-500/30',
  institution: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  kol:         'bg-rose-500/15 text-rose-400 border-rose-500/30',
  hacker:      'bg-red-600/15 text-red-400 border-red-600/30',
  sanctioned:  'bg-red-700/20 text-red-300 border-red-700/40',
  miner:       'bg-stone-500/15 text-stone-400 border-stone-500/30',
  token:       'bg-sky-500/15 text-sky-400 border-sky-500/30',
  whale:       'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  mixer:       'bg-red-500/15 text-red-400 border-red-500/30',
  nft:         'bg-pink-500/15 text-pink-400 border-pink-500/30',
  stablecoin:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  oracle:      'bg-orange-500/15 text-orange-400 border-orange-500/30',
  dao:         'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  other:       'bg-zinc-700/50 text-zinc-400 border-zinc-700',
};

const TYPE_ICON: Record<string, string> = {
  exchange: '🏦', protocol: '⚡', bridge: '🌉', fund: '🏛', institution: '🏢',
  kol: '⭐', hacker: '☠️', sanctioned: '🚫', miner: '⛏️', token: '🪙', whale: '🐋',
  mixer: '🌀', nft: '🎨', stablecoin: '💵', oracle: '📡', dao: '🗳', other: '🏷',
};

const SOURCE_COLOR: Record<string, string> = {
  manual:           'bg-blue-500/15 text-blue-400',
  import:           'bg-green-500/15 text-green-400',
  'github-labels':  'bg-violet-500/15 text-violet-400',
  dawsbot:          'bg-fuchsia-500/15 text-fuchsia-400',
  ens:              'bg-indigo-500/15 text-indigo-400',
  ofac:             'bg-red-500/15 text-red-400',
  'ethereum-lists': 'bg-blue-400/15 text-blue-300',
  arkham:           'bg-purple-400/15 text-purple-300',
  defillama:        'bg-cyan-500/15 text-cyan-400',
  alchemy:          'bg-orange-500/15 text-orange-400',
  clustering:       'bg-amber-500/15 text-amber-400',
  onchain:          'bg-teal-500/15 text-teal-400',
  sourcify:       'bg-pink-500/15 text-pink-400',
  etherscan:      'bg-sky-500/15 text-sky-400',
};

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: EntityStatsData }) {
  const top5Types = Object.entries(stats.by_type)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const top5Sources = Object.entries(stats.by_source)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Total */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 flex items-center gap-4">
        <div className="text-3xl">📚</div>
        <div>
          <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Total labeled addresses</div>
        </div>
      </div>

      {/* By type */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
        <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest mb-3">By Type</div>
        <div className="space-y-1.5">
          {top5Types.map(([type, cnt]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-20 shrink-0">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TYPE_COLOR[type] ?? TYPE_COLOR.other}`}>
                  {type}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-500 rounded-full"
                  style={{ width: `${Math.min(100, (cnt / stats.total) * 100 * 3)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 w-12 text-right">{cnt.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By source */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
        <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest mb-3">By Source</div>
        <div className="space-y-1.5">
          {top5Sources.map(([src, cnt]) => (
            <div key={src} className="flex items-center gap-2">
              <div className="w-28 shrink-0">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SOURCE_COLOR[src] ?? 'bg-zinc-700/50 text-zinc-400'}`}>
                  {src}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-500 rounded-full"
                  style={{ width: `${Math.min(100, (cnt / stats.total) * 100 * 1.2)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 w-14 text-right">{cnt.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Add Entity Modal ──────────────────────────────────────────────────────────

function AddEntityModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    address: '', chain: 'ethereum', label: '',
    entity_name: '', entity_type: 'protocol', confidence: 'high',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr('');
    const res = await addEntity(form);
    setSaving(false);
    if (res.success) { onAdded(); onClose(); }
    else setErr(res.error?.message ?? 'Save failed');
  };

  const field = (
    key: keyof typeof form, label: string,
    opts?: { placeholder?: string; options?: string[] }
  ) => (
    <div>
      <label className="block text-[11px] text-zinc-500 uppercase tracking-widest mb-1.5">{label}</label>
      {opts?.options ? (
        <select
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
        >
          {opts.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={opts?.placeholder}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Add Entity Label</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field('address', 'Address (0x…)', { placeholder: '0x...' })}
          {field('chain', 'Chain', { options: CHAINS })}
          {field('label', 'Label', { placeholder: 'e.g. Binance Hot Wallet 1' })}
          {field('entity_name', 'Entity Name', { placeholder: 'e.g. Binance' })}
          <div className="grid grid-cols-2 gap-3">
            {field('entity_type', 'Type', { options: ENTITY_TYPES })}
            {field('confidence', 'Confidence', { options: ['high', 'medium', 'low'] })}
          </div>

          {err && <p className="text-red-400 text-xs">{err}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.address || !form.label || !form.entity_name}
              className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-black text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Add Entity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main EntityLibrary ────────────────────────────────────────────────────────

export function EntityLibrary() {
  const [stats, setStats]         = useState<EntityStatsData | null>(null);
  const [items, setItems]         = useState<EntityRecord[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  const [q, setQ]           = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [chainFilter, setChainFilter] = useState('');

  const [showAdd, setShowAdd]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await getEntityStats();
      if (res.success) setStats(res.data);
    } catch { /* backend unavailable — stats stay empty */ }
    finally { setStatsLoading(false); }
  }, []);

  const loadItems = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const res = await searchEntities({ q: q || undefined, type: typeFilter || undefined, chain: chainFilter || undefined, page: pg, limit: LIMIT });
      if (res.success) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setPage(pg);
      }
    } catch { /* backend unavailable */ }
    finally { setLoading(false); }
  }, [q, typeFilter, chainFilter]);

  // Initial load
  useEffect(() => { loadStats(); loadItems(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => loadItems(1), 350);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [q, typeFilter, chainFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (item: EntityRecord) => {
    const key = `${item.address}:${item.chain}`;
    setDeletingId(key);
    const res = await deleteEntity(item.address, item.chain);
    setDeletingId(null);
    if (res.success) {
      setItems((prev) => prev.filter((i) => !(i.address === item.address && i.chain === item.chain)));
      setTotal((t) => t - 1);
      loadStats();
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1,2,3].map((i) => <div key={i} className="h-28 bg-zinc-900 rounded-xl animate-pulse" />)}
        </div>
      ) : stats ? (
        <StatsPanel stats={stats} />
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search label, entity name, or address…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 pl-9 text-sm text-zinc-200
                       placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-colors"
          />
          <span className="absolute left-3 top-2.5 text-zinc-600 text-sm">🔍</span>
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="">All types</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>)}
        </select>

        {/* Chain filter */}
        <select
          value={chainFilter}
          onChange={(e) => setChainFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="">All chains</option>
          {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Add button */}
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 rounded-xl bg-zinc-100 text-black text-sm font-medium hover:bg-white transition-colors whitespace-nowrap shrink-0"
        >
          + Add Entity
        </button>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-600">
          {loading ? 'Searching…' : `${total.toLocaleString()} results`}
          {(q || typeFilter || chainFilter) && ' (filtered)'}
        </p>
        {total > 0 && (
          <p className="text-xs text-zinc-600">Page {page} of {totalPages}</p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Label</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Address</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">Chain</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading && items.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-zinc-800 rounded animate-pulse" style={{ width: `${50 + (i % 3) * 15}%` }} />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-zinc-600 text-sm">
                  No entities found
                </td>
              </tr>
            ) : items.map((item) => {
              const deleteKey = `${item.address}:${item.chain}`;
              return (
                <tr key={deleteKey} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-200 truncate max-w-[180px]" title={item.label}>{item.label}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{item.entity_name}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <a href={`/address/${item.address}`}
                        className="font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                        {shortenAddress(item.address)}
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(item.address)}
                        className="text-zinc-700 hover:text-zinc-500 transition-colors text-[10px]"
                        title="Copy"
                      >⎘</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TYPE_COLOR[item.entity_type] ?? TYPE_COLOR.other}`}>
                      {TYPE_ICON[item.entity_type] ?? '🏷'} {item.entity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-zinc-400 capitalize">{item.chain}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLOR[item.source] ?? 'bg-zinc-800 text-zinc-500'}`}>
                      {item.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === deleteKey}
                      className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === deleteKey ? '…' : '✕'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => loadItems(page - 1)}
            disabled={page <= 1 || loading}
            className="px-4 py-2 text-sm text-zinc-400 border border-zinc-800 rounded-lg hover:border-zinc-600 disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span className="px-4 py-2 text-sm text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => loadItems(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-4 py-2 text-sm text-zinc-400 border border-zinc-800 rounded-lg hover:border-zinc-600 disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddEntityModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { loadItems(1); loadStats(); }}
        />
      )}
    </div>
  );
}
