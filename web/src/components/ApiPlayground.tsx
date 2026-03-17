'use client';

import { useState } from 'react';

interface PlaygroundField {
  key:          string;
  label:        string;
  type:         'text' | 'select';
  options?:     string[];
  placeholder?: string;
  default?:     string;
}

interface PlaygroundConfig {
  method:   'GET' | 'POST';
  pathTpl:  string;         // template: /v1/account/:address/portfolio
  fields:   PlaygroundField[];
  bodyMode: boolean;        // true → fields go in JSON body, false → path/query params
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// Build URL and body from field values
function buildRequest(cfg: PlaygroundConfig, vals: Record<string, string>) {
  let path = cfg.pathTpl;
  const qs: Record<string, string> = {};
  const body: Record<string, string> = {};

  for (const f of cfg.fields) {
    const val = vals[f.key] ?? f.default ?? '';
    if (!val) continue;

    if (cfg.bodyMode) {
      body[f.key] = val;
    } else if (path.includes(`:${f.key}`)) {
      path = path.replace(`:${f.key}`, encodeURIComponent(val));
    } else {
      qs[f.key] = val;
    }
  }

  const qStr = Object.keys(qs).length
    ? '?' + new URLSearchParams(qs).toString()
    : '';

  const prefix = API_BASE ? API_BASE : '/api';
  return { url: `${prefix}${path}${qStr}`, body: cfg.bodyMode ? body : null };
}

export function ApiPlayground({ config }: { config: PlaygroundConfig }) {
  const initVals = Object.fromEntries(config.fields.map((f) => [f.key, f.default ?? '']));
  const [vals, setVals]         = useState<Record<string, string>>(initVals);
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus]     = useState<number | null>(null);
  const [latency, setLatency]   = useState<number | null>(null);
  const [loading, setLoading]   = useState(false);

  async function run() {
    setLoading(true);
    setResponse(null);
    const { url, body } = buildRequest(config, vals);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: config.method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const ms = Date.now() - start;
      setStatus(res.status);
      setLatency(ms);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setStatus(0);
      setLatency(Date.now() - start);
      setResponse(`Network error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Try it</span>
        {status !== null && (
          <div className="flex items-center gap-3 text-xs">
            <span className={status >= 200 && status < 300 ? 'text-green-400' : 'text-red-400'}>
              {status === 0 ? 'Network Error' : `HTTP ${status}`}
            </span>
            {latency !== null && <span className="text-zinc-600">{latency}ms</span>}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {config.fields.map((f) => (
          <div key={f.key}>
            <label className="text-[11px] text-zinc-500 block mb-1">{f.label}</label>
            {f.type === 'select' ? (
              <select
                value={vals[f.key] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                value={vals[f.key] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            )}
          </div>
        ))}

        <button
          onClick={run}
          disabled={loading}
          className="mt-1 w-full py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending…' : `Send ${config.method}`}
        </button>
      </div>

      {response && (
        <div className="border-t border-zinc-800">
          <pre className="px-4 py-4 text-xs text-zinc-300 font-mono leading-relaxed overflow-x-auto overflow-y-auto max-h-96 whitespace-pre">
            {response}
          </pre>
        </div>
      )}
    </div>
  );
}
