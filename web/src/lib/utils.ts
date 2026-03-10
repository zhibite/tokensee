export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function formatAmount(amount: string, symbol: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return `${amount} ${symbol}`;
  const formatted = num >= 1000
    ? num.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : num < 0.0001
    ? num.toExponential(4)
    : num.toPrecision(6).replace(/\.?0+$/, '');
  return `${formatted} ${symbol}`;
}

export const CHAIN_LABELS: Record<string, string> = {
  ethereum:  'Ethereum',
  bsc:       'BNB Chain',
  arbitrum:  'Arbitrum',
  polygon:   'Polygon',
  base:      'Base',
  optimism:  'Optimism',
  avalanche: 'Avalanche',
};

export const TYPE_LABELS: Record<string, string> = {
  swap: 'Swap',
  transfer: 'Transfer',
  liquidity_add: 'Add Liquidity',
  liquidity_remove: 'Remove Liquidity',
  borrow: 'Borrow',
  repay: 'Repay',
  stake: 'Stake',
  nft_mint: 'NFT Mint',
  nft_transfer: 'NFT Transfer',
  contract_deploy: 'Deploy Contract',
  contract_interaction: 'Contract Call',
  unknown: 'Unknown',
};

export const PROTOCOL_LABELS: Record<string, string> = {
  'uniswap-v3': 'Uniswap V3',
  'uniswap-v2': 'Uniswap V2',
  'uniswap-universal': 'Uniswap',
  'pancakeswap-v2': 'PancakeSwap V2',
  'pancakeswap-v3': 'PancakeSwap V3',
  'aave-v3': 'Aave V3',
  'curve': 'Curve',
  'compound-v3': 'Compound V3',
  'quickswap-v2': 'QuickSwap V2',
  'aerodrome': 'Aerodrome',
  'gmx': 'GMX',
  'pendle': 'Pendle',
  'eigenlayer': 'EigenLayer',
};

export const DECODE_METHOD_LABELS: Record<string, string> = {
  known_abi: 'Known ABI',
  four_byte: '4byte.directory',
  event_only: 'Events only',
  raw: 'Raw',
};

export const CHAIN_EXPLORERS: Record<string, string> = {
  ethereum:  'https://etherscan.io',
  bsc:       'https://bscscan.com',
  arbitrum:  'https://arbiscan.io',
  polygon:   'https://polygonscan.com',
  base:      'https://basescan.org',
  optimism:  'https://optimistic.etherscan.io',
  avalanche: 'https://snowtrace.io',
};
