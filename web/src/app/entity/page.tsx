import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { EntitySearch } from '@/components/EntitySearch';

export const metadata: Metadata = {
  title: 'Entity Explorer · TokenSee',
  description: 'Look up on-chain entities — exchanges, protocols, funds, and whale wallets — by name.',
};

export default function EntityPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Entity Explorer</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Known Entities</h1>
          <p className="text-zinc-500 text-sm">
            Search exchanges, protocols, funds, and whale wallets by entity name.
            Each entity may control multiple addresses across chains.
          </p>
        </div>

        <EntitySearch />
      </main>
    </div>
  );
}
