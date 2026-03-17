import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { AlertRulesManager } from '@/components/AlertRulesManager';

export const metadata: Metadata = {
  title: 'Alert Rules · TokenSee',
  description: 'Create custom rules to filter whale alerts and dispatch to specific webhooks.',
};

export default function AlertRulesPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-10">

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Alerts</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Alert Rules</h1>
          <p className="text-zinc-500 text-sm">
            Define conditions to filter whale alerts — by chain, asset, type, amount, or specific address.
            Each matching alert triggers delivery to the assigned webhook.
          </p>
        </div>

        <AlertRulesManager />
      </main>
    </div>
  );
}
