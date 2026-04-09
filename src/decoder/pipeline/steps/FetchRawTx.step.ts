import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import { EthereumAdapter } from '../../../chains/ethereum/EthereumAdapter.js';
import { BscAdapter } from '../../../chains/bsc/BscAdapter.js';
import { EvmAdapter } from '../../../chains/evm/EvmAdapter.js';
import type { IChainAdapter } from '../../../chains/base/ChainAdapter.interface.js';
import type { SupportedChain } from '../../../types/chain.types.js';

const adapters: Record<SupportedChain, IChainAdapter> = {
  ethereum:  new EthereumAdapter(),
  bsc:       new BscAdapter(),
  arbitrum:  new EvmAdapter('arbitrum',  42161),
  polygon:   new EvmAdapter('polygon',   137),
  base:      new EvmAdapter('base',      8453),
  optimism:  new EvmAdapter('optimism',  10),
  avalanche: new EvmAdapter('avalanche', 43114),
  zksync:    new EvmAdapter('zksync',     324),
  linea:     new EvmAdapter('linea',     59144),
  scroll:    new EvmAdapter('scroll',    534352),
  zkevm:     new EvmAdapter('zkevm',    1101),
  mantle:    new EvmAdapter('mantle',    5000),
  gnosis:    new EvmAdapter('gnosis',     100),
  metis:     new EvmAdapter('metis',     1088),
  boba:      new EvmAdapter('boba',      288),
  blast:     new EvmAdapter('blast',     81457),
  mode:      new EvmAdapter('mode',      34443),
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
