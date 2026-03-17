'use client';

import { useState } from 'react';
import type { Portfolio, SocialProfile } from '@/lib/types';
import { AddressPortfolio } from './AddressPortfolio';
import { AddressActivity } from './AddressActivity';
import { FundFlowGraph } from './FundFlowGraph';
import { SocialIdentityCard } from './SocialIdentityCard';

interface Props {
  portfolio: Portfolio;
  address: string;
  socialProfile?: SocialProfile | null;
}

type Tab = 'portfolio' | 'activity' | 'graph' | 'social';

const TAB_LABELS: Record<Tab, string> = {
  portfolio: 'Portfolio',
  activity:  'Activity',
  graph:     'Fund Flow',
  social:    'Social',
};

export function AddressTabs({ portfolio, address, socialProfile }: Props) {
  const [tab, setTab] = useState<Tab>('portfolio');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 mb-6">
        {(['portfolio', 'activity', 'graph', 'social'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'social' && socialProfile && socialProfile.identities.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400 font-normal">
                {socialProfile.identities.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'portfolio' && <AddressPortfolio portfolio={portfolio} showHeader={false} />}
      {tab === 'activity'  && <AddressActivity address={address} />}
      {tab === 'graph'     && <FundFlowGraph address={address} />}
      {tab === 'social'    && (
        socialProfile
          ? <SocialIdentityCard profile={socialProfile} />
          : <div className="text-center py-12 text-zinc-600 text-sm">Loading social identities…</div>
      )}
    </div>
  );
}
