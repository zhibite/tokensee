import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import { abiRegistry } from '../../abi/AbiRegistry.js';
import { fourByteResolver } from '../../abi/FourByteResolver.js';

export class AbiDecodeStep implements PipelineStep {
  readonly name = 'AbiDecode';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const { raw } = ctx;
    if (!raw || !raw.to) {
      return ctx; // contract deploy or no target
    }

    const calldata = raw.input;
    if (!calldata || calldata === '0x') {
      return ctx; // native transfer
    }

    // Tier 1: Known protocol ABI (full decode)
    const tier1 = abiRegistry.decodeWithKnownAbi(raw.to, calldata, raw.chain);
    if (tier1) {
      return {
        ...ctx,
        abiDecodeResult: {
          functionName: tier1.functionName,
          args: tier1.args,
          method: tier1.method,
        },
      };
    }

    // Tier 2: 4byte.directory selector lookup (partial decode)
    const selector = calldata.slice(0, 10);
    const textSig = await fourByteResolver.resolve(selector);
    if (textSig) {
      const tier2 = abiRegistry.decodeWithMinimalAbi(textSig, calldata);
      if (tier2) {
        return {
          ...ctx,
          abiDecodeResult: {
            functionName: tier2.functionName,
            args: tier2.args,
            method: 'four_byte',
          },
        };
      }
    }

    // Tier 3: event-only — logs will be processed in Semantic step
    return { ...ctx, abiDecodeResult: undefined };
  }
}
