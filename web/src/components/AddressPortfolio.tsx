import type { Portfolio, ChainPortfolio, TokenBalance } from '@/lib/types';
import { shortenAddress, CHAIN_LABELS, CHAIN_EXPLORERS } from '@/lib/utils';

interface Props {
  portfolio: Portfolio;
  showHeader?: boolean;
}

export function AddressPortfolio({ portfolio, showHeader = true }: Props) {
  const hasValue = portfolio.total_value_usd !== null;

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Address</p>
            <p className="font-mono text-white text-sm break-all">{portfolio.address}</p>
          </div>
          {hasValue && (
            <div className="text-right shrink-0">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Total Value</p>
              <p className="text-2xl font-bold text-white">${Number(portfolio.total_value_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          )}
        </div>
      )}

      {/* Chain sections */}
      {portfolio.chains.map((cp) => (
        <ChainSection key={cp.chain} chain={cp} />
      ))}
    </div>
  );
}

function ChainSection({ chain }: { chain: ChainPortfolio }) {
  const allTokens = [chain.native, ...chain.tokens];
  const chainLabel = CHAIN_LABELS[chain.chain] ?? chain.chain;
  const explorerBase = CHAIN_EXPLORERS[chain.chain] ?? 'https://etherscan.io';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Chain header */}
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChainDot chain={chain.chain} />
          <span className="text-sm font-semibold text-white">{chainLabel}</span>
        </div>
        {chain.total_value_usd && (
          <span className="text-sm text-zinc-300 font-medium">
            ${Number(chain.total_value_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Token rows */}
      <div className="divide-y divide-zinc-800/50">
        {allTokens.map((token, i) => (
          <TokenRow key={i} token={token} explorerBase={explorerBase} isNative={i === 0} />
        ))}
        {chain.tokens.length === 0 && (
          <div className="px-5 py-3 text-xs text-zinc-600">No ERC-20 tokens found</div>
        )}
      </div>
    </div>
  );
}

function TokenRow({ token, explorerBase, isNative }: {
  token: TokenBalance;
  explorerBase: string;
  isNative: boolean;
}) {
  const balance = parseFloat(token.balance);
  const formattedBalance = balance < 0.0001 && balance > 0
    ? balance.toExponential(4)
    : balance.toLocaleString('en-US', { maximumFractionDigits: 6 });

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {token.logo ? (
          <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-zinc-400">{token.symbol.slice(0, 2)}</span>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white">{token.symbol}</span>
            {isNative && (
              <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">native</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 truncate">
            {isNative ? token.name : (
              <a
                href={`${explorerBase}/token/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-zinc-400 transition-colors font-mono"
              >
                {shortenAddress(token.address)}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm text-zinc-200">{formattedBalance} <span className="text-zinc-500 text-xs">{token.symbol}</span></div>
        {token.value_usd ? (
          <div className="text-xs text-zinc-400">${Number(token.value_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        ) : (
          <div className="text-xs text-zinc-700">—</div>
        )}
      </div>
    </div>
  );
}

const CHAIN_DOT_COLOR: Record<string, string> = {
  ethereum:  'bg-blue-400',
  bsc:       'bg-yellow-400',
  arbitrum:  'bg-sky-400',
  polygon:   'bg-purple-400',
  base:      'bg-indigo-400',
  optimism:  'bg-red-400',
  avalanche: 'bg-rose-400',
};

function ChainDot({ chain }: { chain: string }) {
  const color = CHAIN_DOT_COLOR[chain] ?? 'bg-zinc-400';
  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}
