import type { PipelineContext } from '../../types/pipeline.types.js';
import type { TxDecodeRequest, DecodedTransaction } from '../../types/transaction.types.js';
import { FetchRawTxStep } from './steps/FetchRawTx.step.js';
import { AbiDecodeStep } from './steps/AbiDecode.step.js';
import { ProtocolIdentifyStep } from './steps/ProtocolIdentify.step.js';
import { SemanticStep } from './steps/Semantic.step.js';
import { InternalTransfersStep } from './steps/InternalTransfers.step.js';
import { MevDetectStep } from './steps/MevDetect.step.js';

const STEPS = [
  new FetchRawTxStep(),
  new AbiDecodeStep(),
  new ProtocolIdentifyStep(),
  new SemanticStep(),
  new InternalTransfersStep(), // augments assets with internal ETH
  new MevDetectStep(),          // MEV classification (runs last, non-blocking)
];

export class DecodePipeline {
  async execute(request: TxDecodeRequest): Promise<DecodedTransaction> {
    let ctx: PipelineContext = { request };

    for (const step of STEPS) {
      try {
        ctx = await step.execute(ctx);
      } catch (err) {
        throw new Error(`Pipeline step "${step.name}" failed: ${(err as Error).message}`);
      }
    }

    if (!ctx.decoded || !('hash' in ctx.decoded)) {
      throw new Error('Pipeline did not produce a decoded transaction');
    }

    return ctx.decoded as DecodedTransaction;
  }
}

export const decodePipeline = new DecodePipeline();
