import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { SmartMoneyTabs } from '@/components/SmartMoneyTabs';

export const metadata: Metadata = {
  title: 'Smart Money · TokenSee',
  description: 'Track on-chain activity of top VCs, quant funds, and prominent DeFi participants.',
};

export default function SmartMoneyPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-10">

        <div className="mb-8">
          <span className="text-xs text-zinc-500 uppercase tracking-widest">On-chain Intelligence</span>
          <h1 className="text-2xl font-bold text-white mt-2 mb-2">Smart Money</h1>
          <p className="text-zinc-500 text-sm">
            Track large transfers from top VCs, quant funds, market makers, and DAO treasuries.
            Follow what sophisticated on-chain participants are doing in real time.
          </p>
        </div>

        <SmartMoneyTabs />
      </main>
    </div>
  );
}
