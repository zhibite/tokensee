'use client';

import { useState } from 'react';
import type { Portfolio } from '@/lib/types';
import { AddressPortfolio } from './AddressPortfolio';
import { AddressActivity } from './AddressActivity';

interface Props {
  portfolio: Portfolio;
  address: string;
}

type Tab = 'portfolio' | 'activity';

export function AddressTabs({ portfolio, address }: Props) {
  const [tab, setTab] = useState<Tab>('portfolio');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 mb-6">
        {(['portfolio', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {t === 'portfolio' ? 'Portfolio' : 'Activity'}
          </button>
        ))}
      </div>

      {tab === 'portfolio' && <AddressPortfolio portfolio={portfolio} showHeader={false} />}
      {tab === 'activity' && <AddressActivity address={address} />}
    </div>
  );
}
