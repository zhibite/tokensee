'use client';

import { useState, useCallback } from 'react';
import { decodeTx } from '@/lib/api';
import { DecodeResult } from './DecodeResult';
import type { DecodedTransaction, SupportedChain } from '@/lib/types';

const CHAIN_OPTIONS: { value: SupportedChain; label: string }[] = [
  { value: 'ethereum',  label: 'Ethereum' },
  { value: 'arbitrum',  label: 'Arbitrum' },
  { value: 'base',      label: 'Base' },
  { value: 'optimism',  label: 'Optimism' },
  { value: 'polygon',   label: 'Polygon' },
  { value: 'bsc',       label: 'BNB Chain' },
  { value: 'avalanche', label: 'Avalanche' },
];

const EXAMPLE_TXS: { hash: string; chain: SupportedChain; label: string }[] = [
  { hash: '0xb2015b39ae2f42898728158b74c94ac67f646118a9cf245144270c6ecc362e26', chain: 'ethereum', label: 'ETH transfer' },
  { hash: '0x3ca204e45e3801a19cd0217b70fdd33eb0af6cf3e7310878f19ee216e5ff329e', chain: 'ethereum', label: 'Uniswap V3 swap' },
  { hash: '0x9499943b9be82b783f3fc1c11510902e13832383511d38169e4bf20618249610', chain: 'ethereum', label: 'Gnosis Safe' },
];

export function DecodeForm() {
  const [hash, setHash] = useState('');
  const [chain, setChain] = useState<SupportedChain>('ethereum');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: DecodedTransaction; latency: number; cached: boolean } | null>(null);

  const handleDecode = useCallback(async (txHash = hash, txChain = chain) => {
    if (!txHash.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await decodeTx(txHash.trim(), txChain);
    setLoading(false);

    if (res.success) {
      setResult({ data: res.data, latency: res.decode_latency_ms, cached: res.cached });
    } else {
      setError(res.error.message);
    }
  }, [hash, chain]);

  const handleExample = (ex: typeof EXAMPLE_TXS[number]) => {
    setHash(ex.hash);
    setChain(ex.chain);
    handleDecode(ex.hash, ex.chain);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Input group */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDecode()}
            placeholder="0x transaction hash..."
            spellCheck={false}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono
                       text-zinc-200 placeholder-zinc-600 outline-none
                       focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/50
                       transition-colors"
          />
        </div>

        {/* Chain selector */}
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value as SupportedChain)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-3 text-sm text-zinc-300
                     outline-none focus:border-zinc-500 cursor-pointer appearance-none pr-8
                     bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22%3E%3Cpath fill=%22%2371717a%22 d=%22M6 8L1 3h10z%22/%3E%3C/svg%3E')]
                     bg-no-repeat bg-[center_right_0.75rem]"
        >
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <button
          onClick={() => handleDecode()}
          disabled={loading || !hash.trim()}
          className="px-5 py-3 rounded-lg text-sm font-semibold
                     bg-white text-zinc-900 hover:bg-zinc-100
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all active:scale-95"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-zinc-900 rounded-full animate-spin" />
              Decoding
            </span>
          ) : 'Decode'}
        </button>
      </div>

      {/* Example transactions */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-600">Try:</span>
        {EXAMPLE_TXS.map((ex) => (
          <button
            key={ex.hash}
            onClick={() => handleExample(ex)}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <DecodeResult data={result.data} latency={result.latency} cached={result.cached} />
      )}
    </div>
  );
}
