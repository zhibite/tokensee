'use client';

import { useState, useCallback, useEffect } from 'react';
import { listWebhooks, createWebhook, deleteWebhook } from '@/lib/api';
import type { Webhook } from '@/lib/types';

const ALL_EVENTS = [
  'large_transfer', 'exchange_inflow', 'exchange_outflow',
  'whale_movement', 'bridge_deposit', 'bridge_withdrawal',
];

const ALL_CHAINS = [
  'ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche',
  'zksync', 'linea', 'scroll', 'zkevm', 'mantle', 'gnosis', 'metis', 'boba', 'blast', 'mode',
];

const EVENT_LABELS: Record<string, string> = {
  large_transfer:    'Large Transfer',
  exchange_inflow:   'Exchange Inflow',
  exchange_outflow:  'Exchange Outflow',
  whale_movement:    'Whale Movement',
  bridge_deposit:    'Bridge Deposit',
  bridge_withdrawal: 'Bridge Withdrawal',
};

export function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);

  // Form state
  const [name, setName]         = useState('');
  const [url, setUrl]           = useState('');
  const [minUsd, setMinUsd]     = useState(100_000);
  const [events, setEvents]     = useState<string[]>(ALL_EVENTS);
  const [chains, setChains]     = useState<string[]>(ALL_CHAINS);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listWebhooks();
    if (res.success) setWebhooks(res.data.items);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Name is required'); return; }
    if (!url.trim() || !/^https?:\/\/.+/.test(url)) { setFormError('Valid http/https URL is required'); return; }

    setSubmitting(true);
    const res = await createWebhook({ name: name.trim(), url: url.trim(), event_types: events, chains, min_usd: minUsd });
    setSubmitting(false);

    if (!res.success) {
      setFormError(res.error.message);
      return;
    }

    setNewSecret({ id: res.data.id, secret: res.data.secret });
    setShowForm(false);
    setName(''); setUrl(''); setMinUsd(100_000); setEvents(ALL_EVENTS); setChains(ALL_CHAINS);
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    await deleteWebhook(id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  return (
    <div className="space-y-6">

      {/* Secret display (shown once after create) */}
      {newSecret && (
        <div className="rounded-xl border border-yellow-700/40 bg-yellow-950/20 px-5 py-4">
          <p className="text-yellow-400 text-sm font-semibold mb-1">Signing Secret — store it now</p>
          <p className="text-yellow-600 text-xs mb-3">
            This secret is shown only once. Use it to verify webhook signatures from TokenSee.
          </p>
          <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800">
            <code className="text-xs font-mono text-yellow-300 break-all flex-1">{newSecret.secret}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(newSecret.secret); }}
              className="text-zinc-500 hover:text-zinc-300 text-xs shrink-0"
            >
              Copy
            </button>
          </div>
          <button onClick={() => setNewSecret(null)} className="text-xs text-zinc-600 mt-3 hover:text-zinc-400">
            I have saved it — dismiss
          </button>
        </div>
      )}

      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1">Webhooks</p>
          <p className="text-sm text-zinc-400">Receive HTTP POST when whale alerts fire</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(''); }}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-white transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Webhook'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Register Webhook</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="My alert bot"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200
                           placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Endpoint URL</label>
              <input
                value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://myapp.com/webhooks/tokensee"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200
                           placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Min USD threshold</label>
            <div className="flex gap-2 mt-1">
              {[100_000, 500_000, 1_000_000, 10_000_000].map((v) => (
                <button type="button" key={v} onClick={() => setMinUsd(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    minUsd === v ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  ${v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}K`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Events</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ALL_EVENTS.map((ev) => (
                <button type="button" key={ev} onClick={() => toggleItem(events, ev, setEvents)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    events.includes(ev) ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {EVENT_LABELS[ev] ?? ev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Chains</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ALL_CHAINS.map((ch) => (
                <button type="button" key={ch} onClick={() => toggleItem(chains, ch, setChains)}
                  className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                    chains.includes(ch) ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {formError && <p className="text-red-400 text-xs">{formError}</p>}

          <button type="submit" disabled={submitting}
            className="px-5 py-2 rounded-lg bg-white text-zinc-900 text-sm font-semibold
                       hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Creating…' : 'Create Webhook'}
          </button>
        </form>
      )}

      {/* Webhook list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-zinc-900 animate-pulse" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-10 text-center">
          <p className="text-zinc-500 text-sm">No webhooks yet</p>
          <p className="text-zinc-700 text-xs mt-1">Create one to receive real-time whale alerts via HTTP POST</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => <WebhookRow key={wh.id} webhook={wh} onDelete={handleDelete} />)}
        </div>
      )}

      {/* Signature verification snippet */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3">Verify webhook signatures</p>
        <pre className="text-[11px] font-mono text-zinc-500 overflow-x-auto whitespace-pre">{`// Node.js
const sig = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

if (\`sha256=\${sig}\` !== req.headers['x-tokensee-signature']) {
  return res.status(401).send('Invalid signature');
}`}</pre>
      </div>
    </div>
  );
}

function WebhookRow({ webhook: wh, onDelete }: { webhook: Webhook; onDelete: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">{wh.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              wh.active ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700/50 text-zinc-500'
            }`}>
              {wh.active ? 'active' : 'inactive'}
            </span>
          </div>
          <p className="font-mono text-xs text-zinc-500 truncate mb-2">{wh.url}</p>
          <div className="flex flex-wrap gap-1.5">
            {wh.event_types.map((ev) => (
              <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                {EVENT_LABELS[ev] ?? ev}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-zinc-700 mt-2">
            Min ${wh.min_usd.toLocaleString()} · {wh.chains.length} chains
          </p>
        </div>
        <button
          onClick={() => onDelete(wh.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
