import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import { EthereumAdapter } from '../../../chains/ethereum/EthereumAdapter.js';
import { BscAdapter } from '../../../chains/bsc/BscAdapter.js';
import { EvmAdapter } from '../../../chains/evm/EvmAdapter.js';
import type { IChainAdapter } from '../../../chains/base/ChainAdapter.interface.js';
import type { SupportedChain } from '../../../types/chain.types.js';

const adapters: Record<SupportedChain, IChainAdapter> = {
  ethereum: new EthereumAdapter(),
  bsc:      new BscAdapter(),
  arbitrum:  new EvmAdapter('arbitrum', 42161),
  polygon:   new EvmAdapter('polygon', 137),
  base:      new EvmAdapter('base', 8453),
  optimism:  new EvmAdapter('optimism', 10),
  avalanche: new EvmAdapter('avalanche', 43114),
};

export class FetchRawTxStep implements PipelineStep {
  readonly name = 'FetchRawTx';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const { chain, hash } = ctx.request;
    const adapter = adapters[chain];
    if (!adapter) throw new Error(`No adapter for chain: ${chain}`);

    const raw = await adapter.getTransaction(hash);
    return { ...ctx, raw };
  }
}
