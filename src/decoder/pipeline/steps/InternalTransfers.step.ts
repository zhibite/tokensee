/**
 * InternalTransfersStep — enriches a decoded transaction with internal ETH
 * transfers discovered via debug_traceTransaction (Alchemy callTracer).
 *
 * This step runs AFTER the Semantic step so it can augment assets_in/assets_out
 * without interfering with ABI or protocol decoding logic.
 *
 * It only activates when:
 * 1. The chain is Alchemy-supported (ethereum, arbitrum, polygon, base)
 * 2. The transaction has no obvious ETH input/output yet (avoids double-counting)
 *    OR the type is 'contract_interaction' / 'unknown' (most likely to be missing data)
 */

import { NATIVE_TOKEN_ADDRESS } from '../../../config/chains.config.js';
import { traceService } from '../../../services/trace/TraceService.js';
import { priceService } from '../../../services/price/PriceService.js';
import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import type { AssetAmount } from '../../../types/transaction.types.js';

// Chains where Alchemy supports debug_traceTransaction for internal native transfer enrichment.
// Avalanche excluded: Alchemy free tier doesn't support AVAX debug namespace.
const NATIVE_SYMBOL: Record<string, string> = {
  ethereum: 'ETH',
  arbitrum: 'ETH',
  base:     'ETH',
  optimism: 'ETH',
  polygon:  'MATIC',
};

export class InternalTransfersStep implements PipelineStep {
  readonly name = 'InternalTransfers';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const { chain, hash } = ctx.request;
    const decoded = ctx.decoded;

    // Only supported on Alchemy chains
    if (!NATIVE_SYMBOL[chain]) return ctx;
    if (!decoded) return ctx;

    // Skip if we already have rich ETH data in assets
    const hasEthOut = decoded.assets_out?.some((a) => a.address === NATIVE_TOKEN_ADDRESS);
    const hasEthIn  = decoded.assets_in?.some((a) =>  a.address === NATIVE_TOKEN_ADDRESS);
    const typeNeedsTrace = decoded.type === 'contract_interaction' || decoded.type === 'unknown';

    if ((hasEthOut || hasEthIn) && !typeNeedsTrace) return ctx;

    const internalTransfers = await traceService.traceTransaction(hash, chain);
    if (internalTransfers.length === 0) return ctx;

    const sender = ctx.raw?.from ?? '';
    const symbol = NATIVE_SYMBOL[chain];
    const price  = await priceService.getPrice(symbol);

    // Transfers FROM sender = ETH the sender paid via internal call (assets_in from sender's perspective)
    // Transfers TO sender   = ETH the sender received (assets_out from contract perspective = assets_in to user)
    const received = internalTransfers.filter(
      (t) => t.to === sender && t.from !== sender
    );
    const sent = internalTransfers.filter(
      (t) => t.from === sender && t.to !== sender
    );

    const toAssetAmount = (value: string): AssetAmount => {
      const amountUsd = price ? (parseFloat(value) * price).toFixed(2) : undefined;
      return {
        address: NATIVE_TOKEN_ADDRESS,
        symbol,
        decimals: 18,
        amount: value,
        amount_raw: String(BigInt(Math.round(parseFloat(value) * 1e18))),
        amount_usd: amountUsd,
      };
    };

    const newAssetsIn  = [...(decoded.assets_in  ?? [])];
    const newAssetsOut = [...(decoded.assets_out ?? [])];

    for (const t of received) {
      if (!hasEthIn) newAssetsIn.push(toAssetAmount(t.value));
    }
    for (const t of sent) {
      if (!hasEthOut) newAssetsOut.push(toAssetAmount(t.value));
    }

    return {
      ...ctx,
      decoded: {
        ...decoded,
        assets_in:  newAssetsIn,
        assets_out: newAssetsOut,
      },
    };
  }
}
