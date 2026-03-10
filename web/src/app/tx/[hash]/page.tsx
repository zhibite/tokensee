import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { decodeTx } from '@/lib/api';
import { DecodeResult } from '@/components/DecodeResult';
import { NavBar } from '@/components/NavBar';
import { CHAIN_LABELS, shortenHash } from '@/lib/utils';
import type { SupportedChain } from '@/lib/types';

interface Props {
  params: Promise<{ hash: string }>;
  searchParams: Promise<{ chain?: string }>;
}

const VALID_CHAINS: SupportedChain[] = [
  'ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche',
];

function isValidChain(c?: string): c is SupportedChain {
  return VALID_CHAINS.includes(c as SupportedChain);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { hash } = await params;
  const { chain = 'ethereum' } = await searchParams;
  return {
    title: `${shortenHash(hash)} — TokenSee`,
    description: `Decoded transaction ${hash} on ${CHAIN_LABELS[chain] ?? chain}`,
    openGraph: {
      title: `Transaction ${shortenHash(hash)}`,
      description: `View this transaction decoded on TokenSee`,
    },
  };
}

export default async function TxPage({ params, searchParams }: Props) {
  const { hash } = await params;
  const { chain = 'ethereum' } = await searchParams;

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) notFound();
  if (!isValidChain(chain)) notFound();

  const start = Date.now();
  const res = await decodeTx(hash, chain);
  const latency = Date.now() - start;

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <main className="px-4 py-10 flex flex-col items-center">
        <div className="w-full max-w-2xl mb-6">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <a href="/" className="hover:text-zinc-300 transition-colors">TokenSee</a>
            <span>/</span>
            <span className="text-zinc-400">{CHAIN_LABELS[chain] ?? chain}</span>
            <span>/</span>
            <span className="font-mono text-zinc-400">{shortenHash(hash)}</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Transaction</h1>
        </div>

        {res.success ? (
          <DecodeResult data={res.data} latency={latency} cached={res.cached} />
        ) : (
          <div className="w-full max-w-2xl rounded-xl border border-red-900/50 bg-red-950/20 px-5 py-4">
            <p className="text-red-400 text-sm font-medium mb-1">Failed to decode</p>
            <p className="text-red-500/70 text-sm">{res.error.message}</p>
          </div>
        )}
      </main>
    </div>
  );
}
