'use client';

import { useState } from 'react';
import { EntitySearch } from './EntitySearch';
import { EntityLibrary } from './EntityLibrary';

const TABS = [
  { id: 'library', label: '📚 Browse Library' },
  { id: 'search',  label: '🔍 Search by Name' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function EntityTabs() {
  const [active, setActive] = useState<TabId>('library');

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === 'library' && <EntityLibrary />}
      {active === 'search'  && <EntitySearch />}
    </div>
  );
}
