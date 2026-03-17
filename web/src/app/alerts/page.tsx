import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { AlertFeed } from '@/components/AlertFeed';

export const metadata: Metadata = {
  title: 'Whale Alerts · TokenSee',
  description: 'Real-time large on-chain transfers — exchange flows, whale movements, bridge activity.',
};

export default function AlertsPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Live Feed</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Whale Alerts</h1>
          <p className="text-zinc-500 text-sm">
            Large on-chain transfers ≥ $100k — exchange flows, bridge activity, whale movements.
            7 chains · refreshes every 30s.
          </p>
        </div>

        <AlertFeed />
      </main>
    </div>
  );
}
