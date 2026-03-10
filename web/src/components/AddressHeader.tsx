'use client';

import { useState } from 'react';
import { shortenAddress } from '@/lib/utils';

interface Props {
  address: string;
  totalUsd: string | null;
  ensName?: string | null;
}

export function AddressHeader({ address, totalUsd, ensName }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2">Address</p>
        {ensName && (
          <p className="text-base font-semibold text-white mb-0.5">{ensName}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-zinc-300">{shortenAddress(address)}</span>
          <button
            onClick={copy}
            title="Copy address"
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M11 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
        <p className="font-mono text-zinc-600 text-xs mt-0.5 break-all">{address}</p>
      </div>
      {totalUsd && (
        <div className="text-right shrink-0">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Net Worth</p>
          <p className="text-2xl font-bold text-white tabular-nums">
            ${Number(totalUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
    </div>
  );
}
