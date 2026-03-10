import type { PipelineContext, PipelineStep } from '../../../types/pipeline.types.js';
import { detectMev } from '../../mev/MevDetector.js';

/**
 * MevDetectStep — runs after SemanticStep.
 * Annotates ctx.decoded.mev_type without blocking the pipeline.
 */
export class MevDetectStep implements PipelineStep {
  readonly name = 'MevDetectStep';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const d = ctx.decoded;
    if (!d) return ctx;

    const mev = detectMev({
      function_name: d.function_name ?? null,
      protocol: d.protocol ?? null,
      assets_in: d.assets_in ?? [],
      assets_out: d.assets_out ?? [],
      sender: d.sender ?? '',
    });

    return {
      ...ctx,
      decoded: { ...d, mev_type: mev },
    };
  }
}
