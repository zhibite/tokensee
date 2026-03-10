import type { RawTransaction } from './chain.types.js';
import type { TxDecodeRequest, DecodedTransaction } from './transaction.types.js';

export interface PipelineContext {
  request: TxDecodeRequest;
  raw?: RawTransaction;
  decoded?: Partial<DecodedTransaction>;
  abiDecodeResult?: {
    functionName: string;
    args: Record<string, unknown>;
    method: 'known_abi' | 'four_byte' | 'event_only';
  };
}

export interface PipelineStep {
  readonly name: string;
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}
