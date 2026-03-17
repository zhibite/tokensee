import { DecodeForm } from '@/components/DecodeForm';
import { NavBar } from '@/components/NavBar';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-500 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Ethereum + BNB Chain · Live
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight max-w-2xl mx-auto mb-5">
          On-chain data,<br />
          <span className="text-zinc-400">as simple as a REST API</span>
        </h1>

        <p className="text-zinc-500 text-base max-w-lg mx-auto mb-10 leading-relaxed">
          TokenSee is invisible infrastructure for blockchain data.
          Decode transactions, fetch portfolios, and stream activity —
          without touching a node or writing ABI parsers.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#demo"
            className="px-5 py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors"
          >
            Try live demo
          </a>
          <a
            href="/docs"
            className="px-5 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:text-white transition-colors"
          >
            View API docs →
          </a>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="px-4 py-16 max-w-4xl mx-auto">
        <p className="text-center text-xs text-zinc-600 uppercase tracking-widest mb-10">
          Three endpoints. Infinite context.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <FeatureCard
            icon={<DecodeIcon />}
            title="Transaction Decode"
            endpoint="POST /v1/tx/decode"
            desc="Turn any tx hash into a human-readable summary — type, assets moved, USD value, protocol, gas cost."
          />
          <FeatureCard
            icon={<PortfolioIcon />}
            title="Account Portfolio"
            endpoint="GET /v1/account/:addr/portfolio"
            desc="Full token holdings across ETH + BSC, with real-time prices and per-chain USD totals."
          />
          <FeatureCard
            icon={<ActivityIcon />}
            title="Activity Stream"
            endpoint="GET /v1/account/:addr/activity"
            desc="Paginated semantic transaction history — every action decoded and sorted by time."
            soon
          />
        </div>
      </section>

      {/* ── Live Demo ─────────────────────────────────────── */}
      <section id="demo" className="px-4 py-16 border-t border-zinc-900">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2">Live Demo</p>
            <h2 className="text-2xl font-bold text-white">Decode any transaction</h2>
            <p className="text-zinc-500 text-sm mt-2">Paste a tx hash from Etherscan or BscScan</p>
          </div>
          <DecodeForm />
        </div>
      </section>

      {/* ── API Code Sample ──────────────────────────────── */}
      <section className="px-4 py-16 border-t border-zinc-900">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs text-zinc-600 uppercase tracking-widest mb-3">For Developers</p>
            <h2 className="text-2xl font-bold text-white mb-4">
              One API call.<br />Everything decoded.
            </h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">
              No ABIs to manage. No multicall boilerplate. No price feed subscriptions.
              We handle chain complexity so your app just gets clean, typed JSON.
            </p>
            <ul className="space-y-2 text-sm text-zinc-400">
              {[
                'Ethereum + BSC out of the box',
                '3-tier ABI resolution (no black boxes)',
                'USD prices via CoinGecko + DeFiLlama',
                'Sub-200ms p95 latency',
                'Redis-cached, zero duplicate RPC calls',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="ml-2 text-xs text-zinc-600 font-mono">example.ts</span>
            </div>
            <pre className="px-5 py-4 text-xs text-zinc-300 font-mono leading-relaxed overflow-x-auto">
              <code>{`const res = await fetch(
  'https://api.tokensee.com/v1/tx/decode',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.TOKENSEE_KEY,
    },
    body: JSON.stringify({
      hash: '0x3ca2...329e',
      chain: 'ethereum',
    }),
  }
);

const { data } = await res.json();
// data.summary →
// "Swapped 0.5 ETH for 1,482 USDC
//  via Uniswap · $1,482 · fee $2.40"`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 px-4 py-8 text-center text-xs text-zinc-700">
        <p className="mb-1">TokenSee · Invisible Infrastructure · ETH + BSC</p>
        <p>
          <a href="https://tokensee.com" className="hover:text-zinc-500 transition-colors">
            tokensee.com
          </a>
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  endpoint,
  desc,
  soon,
}: {
  icon: React.ReactNode;
  title: string;
  endpoint: string;
  desc: string;
  soon?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3 ${soon ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
          {icon}
        </div>
        {soon && (
          <span className="text-[10px] font-medium text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
            Soon
          </span>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
        <code className="text-[11px] text-zinc-500 font-mono">{endpoint}</code>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function DecodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 5h10M3 8h6M3 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="9" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="11" y="3" width="3" height="11" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8h2.5l2-5 3 10 2-7 1.5 4H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
