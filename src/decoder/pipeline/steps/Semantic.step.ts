import { formatUnits } from 'viem';
import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, DecodeMethod, AssetAmount } from '../../../types/transaction.types.js';
import { protocolRegistry } from '../../protocols/ProtocolRegistry.js';
import { priceService } from '../../../services/price/PriceService.js';
import { formatGwei, formatAmount, buildSwapSummary } from '../../semantic/formatters.js';
import { NATIVE_TOKEN_ADDRESS } from '../../../config/chains.config.js';
import { EthereumAdapter } from '../../../chains/ethereum/EthereumAdapter.js';
import { BscAdapter } from '../../../chains/bsc/BscAdapter.js';
import { EvmAdapter } from '../../../chains/evm/EvmAdapter.js';
import type { IChainAdapter } from '../../../chains/base/ChainAdapter.interface.js';
import type { SupportedChain } from '../../../types/chain.types.js';

const adapterMap: Record<SupportedChain, IChainAdapter> = {
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

const NATIVE_SYMBOL: Record<SupportedChain, string> = {
  ethereum:  'ETH',
  bsc:       'BNB',
  arbitrum:  'ETH',
  polygon:   'MATIC',
  base:      'ETH',
  optimism:  'ETH',
  avalanche: 'AVAX',
  zksync:    'ETH',
  linea:     'ETH',
  scroll:    'ETH',
  zkevm:     'ETH',
  mantle:    'MNT',
  gnosis:    'xDAI',
  metis:     'METIS',
  boba:      'ETH',
  blast:     'ETH',
  mode:      'ETH',
};

export class SemanticStep implements PipelineStep {
  readonly name = 'Semantic';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const { raw, abiDecodeResult } = ctx;
    if (!raw) return ctx;

    const protocolId = ctx.decoded?.protocol ?? null;
    const functionName = abiDecodeResult?.functionName ?? null;

    // Route to protocol handler
    let semantic: Partial<DecodedTransaction> = {};
    if (protocolId) {
      const handler = protocolRegistry.getHandler(protocolId);
      if (handler) {
        if (!functionName || handler.canHandle(functionName)) {
          semantic = await handler.buildSemantic(ctx);
        }
      }
    }

    // Fallback to generic handler
    if (!semantic.type) {
      const fallback = protocolRegistry.getFallbackHandler();
      semantic = await fallback.buildSemantic(ctx);
    }

    // Enrich asset metadata (symbols, decimals, USD values)
    if (semantic.assets_in?.length) {
      semantic.assets_in = await this.enrichAssets(semantic.assets_in, raw.chain);
    }
    if (semantic.assets_out?.length) {
      semantic.assets_out = await this.enrichAssets(semantic.assets_out, raw.chain);
    }

    // Rebuild swap summary with real symbols
    if (
      semantic.type === 'swap' &&
      semantic.assets_in?.length &&
      semantic.assets_out?.length &&
      semantic.protocol
    ) {
      semantic.summary = buildSwapSummary({
        amountIn: semantic.assets_in[0].amount,
        symbolIn: semantic.assets_in[0].symbol,
        amountOut: semantic.assets_out[0].amount,
        symbolOut: semantic.assets_out[0].symbol,
        protocol: semantic.protocol,
      });
    }

    // Gas & fees
    const gasUsed = raw.gasUsed;
    const gasPrice = raw.gasPrice;
    const feeWei = gasUsed * gasPrice;
    const feeEth = formatUnits(feeWei, 18);
    const nativeSymbol = NATIVE_SYMBOL[raw.chain] ?? 'ETH';
    const nativePrice = await priceService.getPrice(nativeSymbol);
    const feeUsd = nativePrice !== null ? (parseFloat(feeEth) * nativePrice).toFixed(2) : null;

    // Decode method
    let decodeMethod: DecodeMethod = 'raw';
    if (abiDecodeResult) {
      decodeMethod = abiDecodeResult.method;
    } else if (semantic.type && semantic.type !== 'unknown') {
      decodeMethod = 'event_only';
    }

    const result: DecodedTransaction = {
      hash: raw.hash,
      chain: raw.chain,
      block_number: raw.blockNumber,
      timestamp: raw.blockTimestamp,
      sender: raw.from,
      sender_entity: null,
      contract_address: raw.to,
      contract_entity: null,
      status: raw.status,
      value_wei: raw.value.toString(),
      type: semantic.type ?? 'unknown',
      protocol: semantic.protocol ?? null,
      protocol_version: semantic.protocol_version ?? null,
      summary: semantic.summary ?? 'Unknown transaction',
      assets_in: semantic.assets_in ?? [],
      assets_out: semantic.assets_out ?? [],
      gas_used: gasUsed.toString(),
      gas_price_gwei: formatGwei(gasPrice),
      gas_price_wei: gasPrice.toString(),
      fee_eth: feeEth,
      fee_usd: feeUsd,
      function_name: functionName,
      function_args: abiDecodeResult?.args ?? null,
      decode_method: decodeMethod,
    };

    return { ...ctx, decoded: result };
  }

  private async enrichAssets(
    assets: AssetAmount[],
    chain: SupportedChain
  ): Promise<AssetAmount[]> {
    const adapter = adapterMap[chain];
    return Promise.all(
      assets.map(async (asset) => {
        if (asset.symbol !== 'UNKNOWN') return asset;
        if (asset.address === NATIVE_TOKEN_ADDRESS) return asset;

        try {
          const meta = await adapter.getTokenMetadata(asset.address);
          const amount = formatAmount(BigInt(asset.amount_raw), meta.decimals);
          const amountUsd = await priceService.getPriceUSD(meta.symbol, amount);

          return {
            ...asset,
            symbol: meta.symbol,
            decimals: meta.decimals,
            amount,
            ...(amountUsd ? { amount_usd: amountUsd } : {}),
          } satisfies AssetAmount;
        } catch {
          return asset;
        }
      })
    );
  }
}
