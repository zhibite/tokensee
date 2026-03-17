'use client';

import { useState } from 'react';
import { shortenAddress } from '@/lib/utils';
import type { SocialProfile } from '@/lib/types';

interface Props {
  address: string;
  totalUsd: string | null;
  ensName?: string | null;
  socialProfile?: SocialProfile | null;
}

export function AddressHeader({ address, totalUsd, ensName, socialProfile }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Primary display name: ENS (from social) > ensName from portfolio > shorten
  const displayName = socialProfile?.ens ?? ensName ?? null;
  const lensHandle  = socialProfile?.lens;
  const farcaster   = socialProfile?.farcaster;
  const entityLabel = socialProfile?.entity;

  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2">Address</p>

        {/* Primary name */}
        {displayName && (
          <p className="text-base font-semibold text-white mb-1">{displayName}</p>
        )}
        {!displayName && entityLabel && (
          <p className="text-base font-semibold text-zinc-300 mb-1">{entityLabel}</p>
        )}

        {/* Address + copy */}
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

        {/* Social badges */}
        {(lensHandle || farcaster) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {lensHandle && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-950/60 text-green-400 border border-green-900/30">
                <svg width="10" height="10" viewBox="0 0 32 32" fill="none">
                  <ellipse cx="16" cy="16" rx="7" ry="9" stroke="#4ADE80" strokeWidth="2.5"/>
                  <circle cx="16" cy="16" r="3" fill="#4ADE80"/>
                </svg>
                {lensHandle}
              </span>
            )}
            {farcaster && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-950/60 text-purple-400 border border-purple-900/30">
                <svg width="10" height="10" viewBox="0 0 32 32" fill="none">
                  <path d="M10 10h12v3h-5v9h-2v-9h-5z" fill="#A78BFA"/>
                </svg>
                {farcaster}
              </span>
            )}
          </div>
        )}
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
