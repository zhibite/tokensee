import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { SmartMoneyFeed } from '@/components/SmartMoneyFeed';

export const metadata: Metadata = {
  title: 'Smart Money · TokenSee',
  description: 'Track on-chain activity of top VCs, quant funds, and prominent DeFi participants.',
};

export default function SmartMoneyPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-10">

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">On-chain intelligence</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Smart Money</h1>
          <p className="text-zinc-500 text-sm">
            Large transfers by top VCs, quant funds, market makers, and whale wallets.
            Follow what sophisticated participants are moving on-chain.
          </p>
        </div>

        <SmartMoneyFeed />
      </main>
    </div>
  );
}
