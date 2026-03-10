'use client';

import type { DecodedTransaction, AssetAmount } from '@/lib/types';
import {
  shortenAddress, shortenHash, formatTimestamp, formatAmount,
  CHAIN_LABELS, TYPE_LABELS, PROTOCOL_LABELS, DECODE_METHOD_LABELS, CHAIN_EXPLORERS,
} from '@/lib/utils';

const NATIVE_SYMBOL: Record<string, string> = {
  ethereum:  'ETH',
  arbitrum:  'ETH',
  base:      'ETH',
  optimism:  'ETH',
  bsc:       'BNB',
  polygon:   'MATIC',
  avalanche: 'AVAX',
};

const CHAIN_BADGE_STYLE: Record<string, { label: string; cls: string }> = {
  ethereum:  { label: 'ETH',  cls: 'bg-blue-500/15 text-blue-400' },
  bsc:       { label: 'BSC',  cls: 'bg-yellow-500/15 text-yellow-400' },
  arbitrum:  { label: 'ARB',  cls: 'bg-sky-500/15 text-sky-400' },
  polygon:   { label: 'POL',  cls: 'bg-purple-500/15 text-purple-400' },
  base:      { label: 'BASE', cls: 'bg-indigo-500/15 text-indigo-400' },
  optimism:  { label: 'OP',   cls: 'bg-red-500/15 text-red-400' },
  avalanche: { label: 'AVAX', cls: 'bg-rose-500/15 text-rose-400' },
};

interface Props {
  data: DecodedTransaction;
  latency: number;
  cached: boolean;
}

export function DecodeResult({ data, latency, cached }: Props) {
  const explorerBase = CHAIN_EXPLORERS[data.chain] ?? 'https://etherscan.io';
  const nativeSymbol = NATIVE_SYMBOL[data.chain] ?? 'ETH';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* Summary card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <TypeBadge type={data.type} />
              {data.protocol && (
                <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                  {PROTOCOL_LABELS[data.protocol] ?? data.protocol}
                </span>
              )}
              <ChainBadge chain={data.chain} />
            </div>
            <p className="text-white font-medium text-sm leading-snug">{data.summary}</p>
          </div>
          <a
            href={`${explorerBase}/tx/${data.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 font-mono shrink-0 mt-0.5 transition-colors"
          >
            {shortenHash(data.hash)} ↗
          </a>
        </div>

        {/* Assets flow */}
        {(data.assets_in.length > 0 || data.assets_out.length > 0) && (
          <div className="px-5 py-3 border-b border-zinc-800 grid grid-cols-2 gap-3">
            <AssetColumn label="SENT" assets={data.assets_in} direction="in" />
            <AssetColumn label="RECEIVED" assets={data.assets_out} direction="out" />
          </div>
        )}

        {/* Details grid */}
        <div className="px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
          <Detail label="From" value={
            <a href={`/address/${data.sender}`}
               className="font-mono text-blue-400 hover:text-blue-300 transition-colors">
              {shortenAddress(data.sender)}
            </a>
          } />
          {data.contract_address && (
            <Detail label="Contract" value={
              <a href={`${explorerBase}/address/${data.contract_address}`} target="_blank" rel="noopener noreferrer"
                 className="font-mono text-blue-400 hover:text-blue-300 transition-colors">
                {shortenAddress(data.contract_address)}
              </a>
            } />
          )}
          <Detail label="Block" value={`#${data.block_number.toLocaleString()}`} />
          <Detail label="Time" value={formatTimestamp(data.timestamp)} />
          <Detail label="Gas" value={`${parseInt(data.gas_used).toLocaleString()} units`} />
          <Detail label="Gas Price" value={`${parseFloat(data.gas_price_gwei).toFixed(2)} Gwei`} />
          <Detail label="Fee" value={
            <>
              <span className="text-zinc-300">{parseFloat(data.fee_eth).toFixed(6)} {nativeSymbol}</span>
              {data.fee_usd && <span className="text-zinc-500 ml-1">(${data.fee_usd})</span>}
            </>
          } />
          <Detail label="Chain" value={CHAIN_LABELS[data.chain] ?? data.chain} />
          {data.function_name && (
            <Detail label="Function" value={
              <code className="text-green-400 bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">
                {data.function_name}()
              </code>
            } />
          )}
          <Detail label="Decoded via" value={DECODE_METHOD_LABELS[data.decode_method] ?? data.decode_method} />
        </div>
      </div>

      {/* Meta bar */}
      <div className="flex items-center justify-between text-[11px] text-zinc-600 px-1">
        <span>{latency}ms · {cached ? 'cached' : 'live'}</span>
        <span>powered by tokensee</span>
      </div>
    </div>
  );
}

function AssetColumn({ label, assets, direction }: {
  label: string;
  assets: AssetAmount[];
  direction: 'in' | 'out';
}) {
  if (assets.length === 0) {
    return (
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</span>
        <p className="text-zinc-700 text-xs">—</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</span>
      {assets.map((a, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className={`text-sm font-semibold ${direction === 'in' ? 'text-red-400' : 'text-green-400'}`}>
            {direction === 'in' ? '-' : '+'}{formatAmount(a.amount, a.symbol)}
          </span>
          {a.amount_usd && (
            <span className="text-xs text-zinc-500">${a.amount_usd}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-zinc-600 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    swap:                 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    transfer:             'bg-blue-500/20 text-blue-300 border-blue-500/30',
    liquidity_add:        'bg-green-500/20 text-green-300 border-green-500/30',
    liquidity_remove:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
    borrow:               'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    repay:                'bg-teal-500/20 text-teal-300 border-teal-500/30',
    stake:                'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    unstake:              'bg-pink-500/20 text-pink-300 border-pink-500/30',
    contract_interaction: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    unknown:              'bg-zinc-800 text-zinc-500 border-zinc-700',
  };
  const cls = colors[type] ?? colors.contract_interaction;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  const b = CHAIN_BADGE_STYLE[chain] ?? { label: chain.toUpperCase(), cls: 'bg-zinc-700/50 text-zinc-400' };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.cls}`}>
      {b.label}
    </span>
  );
}
