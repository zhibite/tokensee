'use client';

import { useState, useEffect } from 'react';
import { listAlertRules, createAlertRule, deleteAlertRule, patchAlertRule, listWebhooks } from '@/lib/api';
import type { AlertRule, AlertRuleConditions, Webhook } from '@/lib/types';

const ALERT_TYPE_OPTIONS = [
  'large_transfer', 'exchange_inflow', 'exchange_outflow',
  'whale_movement', 'bridge_deposit', 'bridge_withdrawal',
];
const CHAIN_OPTIONS = [
  'ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche',
  'zksync', 'linea', 'scroll', 'zkevm', 'mantle', 'gnosis', 'metis', 'boba', 'blast', 'mode',
];
const ASSET_OPTIONS = ['ETH', 'BTC', 'USDC', 'USDT', 'DAI', 'WBTC', 'BNB', 'MATIC', 'AVAX'];

function formatUsd(n?: number) {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export function AlertRulesManager() {
  const [rules, setRules]           = useState<AlertRule[]>([]);
  const [webhooks, setWebhooks]     = useState<Webhook[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // Form state
  const [name, setName]             = useState('');
  const [description, setDescription] = useState('');
  const [webhookId, setWebhookId]   = useState('');
  const [minUsd, setMinUsd]         = useState('');
  const [maxUsd, setMaxUsd]         = useState('');
  const [selChains, setSelChains]   = useState<string[]>([]);
  const [selTypes, setSelTypes]     = useState<string[]>([]);
  const [selAssets, setSelAssets]   = useState<string[]>([]);
  const [watchAddr, setWatchAddr]   = useState('');

  useEffect(() => {
    Promise.all([loadRules(), loadWebhooks()]);
  }, []);

  async function loadRules() {
    setLoading(true);
    const res = await listAlertRules().catch(() => null);
    if (res?.success) setRules(res.data.items);
    setLoading(false);
  }

  async function loadWebhooks() {
    const res = await listWebhooks().catch(() => null);
    if (res?.success) setWebhooks(res.data.items);
  }

  function toggleSet<T>(set: T[], val: T): T[] {
    return set.includes(val) ? set.filter((x) => x !== val) : [...set, val];
  }

  async function handleCreate() {
    if (!name.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    setFormError(null);

    const conditions: AlertRuleConditions = {};
    if (selChains.length)  conditions.chains        = selChains;
    if (selTypes.length)   conditions.alert_types   = selTypes;
    if (selAssets.length)  conditions.asset_symbols = selAssets;
    if (minUsd)            conditions.min_usd       = Number(minUsd);
    if (maxUsd)            conditions.max_usd       = Number(maxUsd);
    if (watchAddr.trim())  conditions.addresses     = watchAddr.split(',').map((a) => a.trim()).filter(Boolean);

    const res = await createAlertRule({
      name: name.trim(),
      description: description.trim() || undefined,
      conditions,
      webhook_id: webhookId || undefined,
    });

    if (!res.success) {
      setFormError('Failed to create rule');
      setSaving(false);
      return;
    }

    // Reset form
    setName(''); setDescription(''); setWebhookId('');
    setMinUsd(''); setMaxUsd(''); setSelChains([]); setSelTypes([]); setSelAssets([]); setWatchAddr('');
    setShowForm(false);
    setSaving(false);
    await loadRules();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return;
    await deleteAlertRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleToggle(id: string, active: boolean) {
    await patchAlertRule(id, { active });
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, active } : r));
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-zinc-400 text-sm">
            Rules evaluate incoming whale alerts and dispatch to a specific webhook when conditions match.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-100 transition-colors shrink-0"
        >
          + New Rule
        </button>
      </div>

      {/* ── Create Form ────────────────────────────────── */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-white">New Alert Rule</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Rule Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Large ETH inflows"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">Webhook (action)</label>
              <select
                value={webhookId}
                onChange={(e) => setWebhookId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="">— none —</option>
                {webhooks.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note about this rule"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Conditions */}
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Conditions (all optional — empty = match all)</p>

            <div>
              <label className="text-xs text-zinc-600 block mb-2">Chains</label>
              <div className="flex flex-wrap gap-2">
                {CHAIN_OPTIONS.map((c) => (
                  <button key={c} onClick={() => setSelChains((p) => toggleSet(p, c))}
                    className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                      selChains.includes(c) ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}>{c}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-600 block mb-2">Alert Types</label>
              <div className="flex flex-wrap gap-2">
                {ALERT_TYPE_OPTIONS.map((t) => (
                  <button key={t} onClick={() => setSelTypes((p) => toggleSet(p, t))}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selTypes.includes(t) ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}>{t.replace(/_/g, ' ')}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-600 block mb-2">Assets</label>
              <div className="flex flex-wrap gap-2">
                {ASSET_OPTIONS.map((a) => (
                  <button key={a} onClick={() => setSelAssets((p) => toggleSet(p, a))}
                    className={`text-xs px-3 py-1.5 rounded-full border font-mono transition-colors ${
                      selAssets.includes(a) ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}>{a}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-600 block mb-1.5">Min USD</label>
                <input value={minUsd} onChange={(e) => setMinUsd(e.target.value)} type="number" placeholder="100000"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-600 block mb-1.5">Max USD</label>
                <input value={maxUsd} onChange={(e) => setMaxUsd(e.target.value)} type="number" placeholder="unlimited"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-600 block mb-1.5">Watch Addresses (comma-separated)</label>
              <input value={watchAddr} onChange={(e) => setWatchAddr(e.target.value)}
                placeholder="0x1234..., 0xabcd..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500" />
            </div>
          </div>

          {formError && <p className="text-red-400 text-xs">{formError}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={handleCreate} disabled={saving}
              className="text-sm px-5 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Rule'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-sm px-5 py-2 border border-zinc-700 text-zinc-400 rounded-lg hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Rules List ─────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-zinc-900 rounded-lg animate-pulse" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-sm">No alert rules yet.</p>
          <p className="text-zinc-700 text-xs mt-1">Create a rule to get targeted webhook delivery for specific alert conditions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              webhookName={webhooks.find((w) => w.id === rule.webhook_id)?.name}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule, webhookName, onDelete, onToggle,
}: {
  rule: AlertRule;
  webhookName?: string;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const c = rule.conditions;
  const condParts: string[] = [];
  if (c.chains?.length)        condParts.push(c.chains.join(', '));
  if (c.asset_symbols?.length) condParts.push(c.asset_symbols.join('/'));
  if (c.alert_types?.length)   condParts.push(c.alert_types.map((t) => t.replace(/_/g, ' ')).join(', '));
  if (c.min_usd)               condParts.push(`≥ ${formatUsd(c.min_usd)}`);
  if (c.max_usd)               condParts.push(`≤ ${formatUsd(c.max_usd)}`);
  if (c.addresses?.length)     condParts.push(`${c.addresses.length} address(es)`);

  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors ${rule.active ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-800/40 bg-zinc-900/20 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${rule.active ? 'bg-green-500' : 'bg-zinc-600'}`} />
            <span className="text-sm font-medium text-white">{rule.name}</span>
            {rule.description && (
              <span className="text-xs text-zinc-600">— {rule.description}</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
            {condParts.length > 0 ? (
              condParts.map((p, i) => (
                <span key={i} className="bg-zinc-800 px-2 py-0.5 rounded">{p}</span>
              ))
            ) : (
              <span className="text-zinc-700">matches all alerts</span>
            )}
            {webhookName && (
              <>
                <span className="text-zinc-700">→</span>
                <span className="text-violet-400">{webhookName}</span>
              </>
            )}
          </div>

          {rule.triggered_count > 0 && (
            <p className="text-xs text-zinc-700 mt-1">
              Triggered {rule.triggered_count}× · last {rule.last_triggered_at ? new Date(rule.last_triggered_at).toLocaleDateString() : '—'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(rule.id, !rule.active)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600"
          >
            {rule.active ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="text-xs text-red-500/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-zinc-800 hover:border-red-900/40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
