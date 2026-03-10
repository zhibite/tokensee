import { formatUnits as viemFormatUnits } from 'viem';

export function formatAmount(raw: bigint, decimals: number): string {
  return viemFormatUnits(raw, decimals);
}

export function formatUSD(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
}

export function formatGwei(wei: bigint): string {
  return viemFormatUnits(wei, 9);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Build a human-readable swap summary
export function buildSwapSummary(params: {
  amountIn: string;
  symbolIn: string;
  amountOut: string;
  symbolOut: string;
  protocol: string;
}): string {
  const { amountIn, symbolIn, amountOut, symbolOut, protocol } = params;
  const protocolName = PROTOCOL_DISPLAY_NAMES[protocol] ?? protocol;
  return `Swapped ${trimAmount(amountIn)} ${symbolIn} for ${trimAmount(amountOut)} ${symbolOut} via ${protocolName}`;
}

export function buildTransferSummary(params: {
  amount: string;
  symbol: string;
  from: string;
  to: string;
}): string {
  return `Transferred ${trimAmount(params.amount)} ${params.symbol} to ${shortenAddress(params.to)}`;
}

export function buildNativeTransferSummary(params: {
  amount: string;
  symbol: string;
  to: string;
}): string {
  return `Sent ${trimAmount(params.amount)} ${params.symbol} to ${shortenAddress(params.to)}`;
}

// Remove trailing zeros but keep at least 2 decimal places for readability
function trimAmount(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  if (num === 0) return '0';
  if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (num >= 1) return num.toPrecision(5).replace(/\.?0+$/, '');
  return num.toPrecision(4).replace(/\.?0+$/, '');
}

const PROTOCOL_DISPLAY_NAMES: Record<string, string> = {
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
};
