import type { SupportedChain } from './chain.types.js';
import type { TransactionType } from './transaction.types.js';
import type { PipelineContext } from './pipeline.types.js';
import type { DecodedTransaction } from './transaction.types.js';

export interface ProtocolInfo {
  id: string; // 'uniswap-v3'
  name: string; // 'Uniswap V3'
  version: string; // 'v3'
  category: 'dex' | 'lending' | 'staking' | 'bridge' | 'nft' | 'other';
  chains: SupportedChain[];
}

export interface IProtocolHandler {
  readonly protocolId: string;
  canHandle(functionName: string): boolean;
  buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>>;
}

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}
