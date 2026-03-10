import type { PipelineStep, PipelineContext } from '../../../types/pipeline.types.js';
import { protocolRegistry } from '../../protocols/ProtocolRegistry.js';

export class ProtocolIdentifyStep implements PipelineStep {
  readonly name = 'ProtocolIdentify';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const { raw } = ctx;
    if (!raw?.to) return ctx;

    const protocolId = protocolRegistry.getProtocolId(raw.to, raw.chain);

    return {
      ...ctx,
      decoded: {
        ...ctx.decoded,
        protocol: protocolId,
        contract_address: raw.to,
      },
    };
  }
}
