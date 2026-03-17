import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { WebhookManager } from '@/components/WebhookManager';

export const metadata: Metadata = {
  title: 'Webhooks · TokenSee',
  description: 'Register HTTP endpoints to receive real-time whale alert notifications.',
};

export default function WebhooksPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Webhooks</p>
          <h1 className="text-2xl font-bold text-white mb-2">Webhook Management</h1>
          <p className="text-zinc-500 text-sm">
            Register URLs to receive HTTP POST payloads when whale alerts fire.
            Each delivery is signed with HMAC-SHA256 for verification.
          </p>
        </div>
        <WebhookManager />
      </main>
    </div>
  );
}
