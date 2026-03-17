'use client';

import type { SocialProfile, SocialIdentity, SocialPlatform } from '@/lib/types';

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<SocialPlatform, {
  label: string;
  color: string;       // badge bg
  textColor: string;   // badge text
  icon: React.ReactNode;
}> = {
  ens: {
    label: 'ENS',
    color: 'bg-blue-950/60',
    textColor: 'text-blue-400',
    icon: (
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none" className="shrink-0">
        <circle cx="16" cy="16" r="14" fill="#5298FF" opacity="0.2"/>
        <path d="M9 20.5L16 11l7 9.5" stroke="#5298FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 11v10.5" stroke="#5298FF" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  lens: {
    label: 'Lens',
    color: 'bg-green-950/60',
    textColor: 'text-green-400',
    icon: (
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none" className="shrink-0">
        <circle cx="16" cy="16" r="14" fill="#00501E" opacity="0.5"/>
        <ellipse cx="16" cy="16" rx="7" ry="9" stroke="#4ADE80" strokeWidth="2"/>
        <circle cx="16" cy="16" r="3" fill="#4ADE80"/>
      </svg>
    ),
  },
  farcaster: {
    label: 'Farcaster',
    color: 'bg-purple-950/60',
    textColor: 'text-purple-400',
    icon: (
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none" className="shrink-0">
        <circle cx="16" cy="16" r="14" fill="#7C3AED" opacity="0.2"/>
        <path d="M10 10h12v3h-5v9h-2v-9h-5z" fill="#A78BFA"/>
      </svg>
    ),
  },
  entity: {
    label: 'Entity',
    color: 'bg-zinc-800/80',
    textColor: 'text-zinc-400',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
};

const CONFIDENCE_DOT: Record<string, string> = {
  high:   'bg-emerald-400',
  medium: 'bg-yellow-400',
  low:    'bg-zinc-500',
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function IdentityRow({ identity }: { identity: SocialIdentity }) {
  const cfg = PLATFORM_CONFIG[identity.platform];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      {/* Platform badge */}
      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.color} ${cfg.textColor} shrink-0 w-[90px]`}>
        {cfg.icon}
        {cfg.label}
      </span>

      {/* Handle */}
      <span className="font-mono text-sm text-white flex-1 truncate">{identity.handle}</span>

      {/* Confidence */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[identity.confidence] ?? 'bg-zinc-600'}`} />
        <span className="text-xs text-zinc-600">{identity.confidence}</span>
      </span>

      {/* Source */}
      <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">{identity.source}</span>
    </div>
  );
}

// ─── Platform group ───────────────────────────────────────────────────────────

function PlatformGroup({ platform, identities }: { platform: SocialPlatform; identities: SocialIdentity[] }) {
  if (identities.length === 0) return null;
  const cfg = PLATFORM_CONFIG[platform];

  return (
    <div className="mb-4">
      <div className={`flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-wider ${cfg.textColor}`}>
        {cfg.icon}
        {cfg.label}
        <span className="ml-auto text-zinc-600 font-normal normal-case tracking-normal">{identities.length}</span>
      </div>
      <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
        {identities.map((id, i) => (
          <IdentityRow key={i} identity={id} />
        ))}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface Props {
  profile: SocialProfile;
}

const PLATFORM_ORDER: SocialPlatform[] = ['ens', 'lens', 'farcaster', 'entity'];

export function SocialIdentityCard({ profile }: Props) {
  const grouped = PLATFORM_ORDER.reduce<Record<SocialPlatform, SocialIdentity[]>>(
    (acc, p) => ({ ...acc, [p]: profile.identities.filter((i) => i.platform === p) }),
    { ens: [], lens: [], farcaster: [], entity: [] },
  );

  const totalCount = profile.identities.length;

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 p-8 text-center">
        <div className="text-zinc-600 text-sm">No social identities found for this address.</div>
        <div className="text-zinc-700 text-xs mt-1">ENS, Lens, and Farcaster handles will appear here once resolved.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-5">
        {profile.ens && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-950/60 text-blue-300 border border-blue-900/40">
            {PLATFORM_CONFIG.ens.icon}
            {profile.ens}
          </span>
        )}
        {profile.lens && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-950/60 text-green-300 border border-green-900/40">
            {PLATFORM_CONFIG.lens.icon}
            {profile.lens}
          </span>
        )}
        {profile.farcaster && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-950/60 text-purple-300 border border-purple-900/40">
            {PLATFORM_CONFIG.farcaster.icon}
            {profile.farcaster}
          </span>
        )}
        {profile.entity && !profile.ens && !profile.lens && !profile.farcaster && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            {PLATFORM_CONFIG.entity.icon}
            {profile.entity}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-600 self-center">{totalCount} total identities</span>
      </div>

      {/* Groups */}
      {PLATFORM_ORDER.map((p) => (
        <PlatformGroup key={p} platform={p} identities={grouped[p]} />
      ))}
    </div>
  );
}
