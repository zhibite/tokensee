import type { RawTransaction, SupportedChain } from '../../types/chain.types.js';
import type { TokenMetadata } from '../../types/protocol.types.js';

export interface IChainAdapter {
  readonly chain: SupportedChain;
  readonly chainId: number;

  getTransaction(hash: string): Promise<RawTransaction>;
  getTokenMetadata(address: string): Promise<TokenMetadata>;
  isContractAddress(address: string): Promise<boolean>;
}
