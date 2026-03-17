'use client';

import { useState } from 'react';
import type { Portfolio } from '@/lib/types';
import { AddressPortfolio } from './AddressPortfolio';
import { AddressActivity } from './AddressActivity';
import { FundFlowGraph } from './FundFlowGraph';

interface Props {
  portfolio: Portfolio;
  address: string;
}

type Tab = 'portfolio' | 'activity' | 'graph';

const TAB_LABELS: Record<Tab, string> = {
  portfolio: 'Portfolio',
  activity:  'Activity',
  graph:     'Fund Flow',
};

export function AddressTabs({ portfolio, address }: Props) {
  const [tab, setTab] = useState<Tab>('portfolio');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 mb-6">
        {(['portfolio', 'activity', 'graph'] as Tab[]).map((t) => (
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
          </button>
        ))}
      </div>

      {tab === 'portfolio' && <AddressPortfolio portfolio={portfolio} showHeader={false} />}
      {tab === 'activity'  && <AddressActivity address={address} />}
      {tab === 'graph'     && <FundFlowGraph address={address} />}
    </div>
  );
}
