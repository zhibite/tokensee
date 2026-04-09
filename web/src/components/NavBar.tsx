'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface DropdownItem {
  href: string;
  label: string;
  description?: string;
  badge?: string;
  dot?: string; // color class for live dot
}

interface NavDropdownProps {
  label: string;
  items: DropdownItem[];
  activePaths?: string[];
}

function NavDropdown({ label, items, activePaths = [] }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isActive = activePaths.some(p => pathname.startsWith(p));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 text-sm transition-colors ${
          isActive ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {label}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-52 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl py-1 z-50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-start gap-3 px-3 py-2.5 hover:bg-zinc-900 transition-colors group ${
                pathname === item.href ? 'bg-zinc-900/60' : ''
              }`}
            >
              {item.dot && (
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${
                    pathname === item.href ? 'text-zinc-200' : 'text-zinc-400 group-hover:text-zinc-200'
                  } transition-colors`}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-medium">
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-[11px] text-zinc-600 mt-0.5 leading-tight">{item.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="border-b border-zinc-800/60 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
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

        {/* Nav links */}
        <div className="flex items-center gap-5 text-sm text-zinc-500">

          <Link
            href="/"
            className={`hover:text-zinc-300 transition-colors ${isActive('/') ? 'text-zinc-200' : ''}`}
          >
            Decode
          </Link>

          {/* Monitor dropdown */}
          <NavDropdown
            label="Monitor"
            activePaths={['/intelligence', '/alerts', '/security', '/flow']}
            items={[
              {
                href: '/intelligence',
                label: 'Intelligence',
                description: 'Classified event feed with narratives',
                dot: 'bg-green-500 animate-pulse',
              },
              {
                href: '/alerts',
                label: 'Whale Alerts',
                description: 'Raw large transfers ≥$100k',
              },
              {
                href: '/security',
                label: 'Security Wall',
                description: 'Hackers, sanctioned & mixer activity',
                badge: 'new',
              },
              {
                href: '/flow',
                label: 'Fund Flow',
                description: 'Visualize capital between entities',
                badge: 'new',
              },
            ]}
          />

          <Link
            href="/smart-money"
            className={`hover:text-zinc-300 transition-colors ${isActive('/smart-money') ? 'text-zinc-200' : ''}`}
          >
            Smart Money
          </Link>

          <Link
            href="/entity"
            className={`hover:text-zinc-300 transition-colors ${isActive('/entity') ? 'text-zinc-200' : ''}`}
          >
            Entities
          </Link>

          {/* Dev tools dropdown */}
          <NavDropdown
            label="Dev"
            activePaths={['/alert-rules', '/webhooks', '/docs']}
            items={[
              {
                href: '/alert-rules',
                label: 'Alert Rules',
                description: 'Custom event subscriptions',
              },
              {
                href: '/webhooks',
                label: 'Webhooks',
                description: 'Push delivery configuration',
              },
              {
                href: '/docs',
                label: 'API Docs',
                description: 'REST API reference',
              },
            ]}
          />

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
