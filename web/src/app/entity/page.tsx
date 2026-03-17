import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { EntityTabs } from '@/components/EntityTabs';

export const metadata: Metadata = {
  title: 'Entity Library · TokenSee',
  description: 'Explore and manage on-chain entity labels — exchanges, protocols, funds, and whale wallets.',
};

export default function EntityPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-10">

        <div className="mb-8">
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Entity Library</span>
          <h1 className="text-2xl font-bold text-white mt-2 mb-2">On-Chain Address Labels</h1>
          <p className="text-zinc-500 text-sm">
            32,000+ labeled addresses across 5 chains — search by name, browse by type, or manage your own labels.
          </p>
        </div>

        <EntityTabs />
      </main>
    </div>
  );
}
