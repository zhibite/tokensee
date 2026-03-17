import Link from 'next/link';

export function NavBar() {
  return (
    <nav className="border-b border-zinc-800/60 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="#09090b" />
              <circle cx="8" cy="8" r="6.5" stroke="#09090b" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight group-hover:text-zinc-300 transition-colors">
            tokensee
          </span>
        </Link>

        <div className="flex items-center gap-5 text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-300 transition-colors">Decode</Link>
          <Link href="/alerts" className="hover:text-zinc-300 transition-colors flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Alerts
          </Link>
          <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          <Link href="/smart-money" className="hover:text-zinc-300 transition-colors">Smart Money</Link>
          <Link href="/entity" className="hover:text-zinc-300 transition-colors">Entities</Link>
          <Link href="/webhooks" className="hover:text-zinc-300 transition-colors">Webhooks</Link>
          <Link href="/alert-rules" className="hover:text-zinc-300 transition-colors">Rules</Link>
          <Link href="/docs" className="hover:text-zinc-300 transition-colors">Docs</Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
