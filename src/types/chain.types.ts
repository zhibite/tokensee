export type SupportedChain =
  | 'ethereum'
  | 'bsc'
  | 'arbitrum'
  | 'polygon'
  | 'base'
  | 'optimism'
  | 'avalanche'
  | 'zksync'
  | 'linea'
  | 'scroll'
  | 'zkevm'
  | 'mantle'
  | 'gnosis'
  | 'metis'
  | 'boba'
  | 'blast'
  | 'mode';

export interface ChainConfig {
  chainId: number;
  name: SupportedChain;
  displayName: string;
  nativeCurrency: { symbol: string; decimals: number; address: string };
  rpcUrls: string[];
  explorerUrl: string;
  blockTime: number; // average seconds per block
}

export interface RawLog {
  address: string; // lowercase hex
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
}

export interface RawTransaction {
  hash: string;
  chain: SupportedChain;
  blockNumber: number;
  blockTimestamp: number; // unix seconds
  from: string; // lowercase hex
  to: string | null; // null = contract deploy
  value: bigint; // in wei
  input: string; // raw calldata hex
  gasUsed: bigint;
  gasPrice: bigint;
  status: 0 | 1;
  logs: RawLog[];
}
