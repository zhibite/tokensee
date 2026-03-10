import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { AddressHeader } from '@/components/AddressHeader';
import { AddressTabs } from '@/components/AddressTabs';
import { getPortfolio } from '@/lib/api';
import { shortenAddress } from '@/lib/utils';

interface Props {
  params: Promise<{ addr: string }>;
  searchParams: Promise<{ chains?: string }>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { addr } = await params;
  if (!ADDRESS_RE.test(addr)) return {};
  return {
    title: `${shortenAddress(addr)} · TokenSee`,
    description: `Portfolio and on-chain activity for ${addr}`,
  };
}

export default async function AddressPage({ params, searchParams }: Props) {
  const { addr } = await params;
  const { chains = 'ethereum,bsc,arbitrum,polygon,base,optimism,avalanche' } = await searchParams;

  if (!ADDRESS_RE.test(addr)) notFound();

  const res = await getPortfolio(addr, chains);

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-6">
          <a href="/" className="hover:text-zinc-400 transition-colors">tokensee</a>
          <span>/</span>
          <span className="font-mono text-zinc-400">{shortenAddress(addr)}</span>
        </div>

        {res.success ? (
          <>
            <AddressHeader address={res.data.address} totalUsd={res.data.total_value_usd} ensName={res.data.ens_name ?? null} />
            <AddressTabs portfolio={res.data} address={addr} />
          </>
        ) : (
          <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4">
            <p className="text-sm font-semibold text-red-400 mb-1">Failed to load portfolio</p>
            <p className="text-xs text-red-700">{res.error.message}</p>
          </div>
        )}
      </main>
    </div>
  );
}
