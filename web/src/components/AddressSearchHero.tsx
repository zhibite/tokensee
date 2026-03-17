'use client';

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const EXAMPLES = [
  { label: 'Vitalik', addr: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  { label: 'Binance', addr: '0x28C6c06298d514Db089934071355E5743bf21d60' },
];

export function AddressSearchHero() {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();

  const go = (addr?: string) => {
    const v = (addr ?? value).trim();
    if (!ADDRESS_RE.test(v)) { setError(true); return; }
    setError(false);
    router.push(`/address/${v.toLowerCase()}`);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') go();
    if (error) setError(false);
  };

  return (
    <div className="space-y-3">
      <div className={`flex items-center rounded-xl border ${error ? 'border-red-700' : 'border-zinc-700'} bg-zinc-900 overflow-hidden focus-within:border-zinc-500 transition-colors`}>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="ml-4 shrink-0 text-zinc-500"
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={onKey}
          placeholder="Search any address…"
          spellCheck={false}
          className="flex-1 px-3 py-3 bg-transparent text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
        />
        <button
          onClick={() => go()}
          className="px-4 py-3 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-l border-zinc-700"
        >
          Go →
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 text-left px-1">
          Please enter a valid EVM address (0x + 40 hex chars)
        </p>
      )}

      {/* Quick examples */}
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <span>Try:</span>
        {EXAMPLES.map(({ label, addr }) => (
          <button
            key={addr}
            onClick={() => go(addr)}
            className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-zinc-700">ENS · Portfolio · Social · Fund Flow</span>
      </div>
    </div>
  );
}
