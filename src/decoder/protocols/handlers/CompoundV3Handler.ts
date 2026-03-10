import { decodeEventLog } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import type { RawLog } from '../../../types/chain.types.js';
import { formatAmount } from '../../semantic/formatters.js';

// Compound V3 (Comet) event topics
const COMPOUND_SUPPLY_TOPIC =
  '0xd1cf3d156d5f8f0d50f6c122ed609cec09d35c9d7d8b5309bebe5f8c09a8b84e';
const COMPOUND_WITHDRAW_TOPIC =
  '0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb';
const COMPOUND_BORROW_TOPIC =
  '0x312a5e5e1079f5dda4e95dbbd0b908b291fd5b992ef22073643ab691572c5b52';
const COMPOUND_REPAY_TOPIC =
  '0xeccd58d8a8faadb7f218a9a87c7f2fcafb72b0ce3fcca61d97c03b0db16b9fa5';

const SUPPLY_ABI = [{
  type: 'event', name: 'Supply',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'dst', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ],
}] as const;

const WITHDRAW_ABI = [{
  type: 'event', name: 'Withdraw',
  inputs: [
    { name: 'src', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ],
}] as const;

const SUPPLY_COLLATERAL_ABI = [{
  type: 'event', name: 'SupplyCollateral',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'dst', type: 'address', indexed: true },
    { name: 'asset', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ],
}] as const;

const COMPOUND_FUNCTIONS = [
  'supply', 'supplyTo', 'supplyFrom',
  'withdraw', 'withdrawTo', 'withdrawFrom',
  'repay',
];

export class CompoundV3Handler implements IProtocolHandler {
  readonly protocolId = 'compound-v3';

  canHandle(functionName: string): boolean {
    return COMPOUND_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, abiDecodeResult } = ctx;
    if (!raw) return {};

    const fn = abiDecodeResult?.functionName ?? '';
    const topics0 = raw.logs.map((l) => l.topics[0]);

    if (topics0.includes(COMPOUND_SUPPLY_TOPIC) || fn.startsWith('supply')) {
      return this.handleSupply(raw.logs, raw.from);
    }
    if (topics0.includes(COMPOUND_WITHDRAW_TOPIC) || fn.startsWith('withdraw')) {
      return this.handleWithdraw(raw.logs, raw.from);
    }

    return {
      type: 'contract_interaction',
      protocol: 'compound-v3',
      protocol_version: 'v3',
      summary: 'Compound V3 interaction',
      assets_in: [],
      assets_out: [],
    };
  }

  private handleSupply(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find(
      (l) => l.topics[0] === COMPOUND_SUPPLY_TOPIC || l.topics[0] === '0x' + COMPOUND_SUPPLY_TOPIC.slice(2)
    );
    if (!log) return this.fallback('Supplied to Compound V3', 'contract_interaction');

    try {
      const decoded = decodeEventLog({
        abi: SUPPLY_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Supply',
      });
      const args = decoded.args as { from: string; dst: string; amount: bigint };
      const asset: AssetAmount = {
        address: log.address.toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount, 18),
        amount_raw: args.amount.toString(),
      };
      return {
        type: 'contract_interaction',
        protocol: 'compound-v3',
        protocol_version: 'v3',
        summary: `Supplied to Compound V3`,
        assets_out: [asset],
        assets_in: [],
      };
    } catch { return this.fallback('Supplied to Compound V3', 'contract_interaction'); }
  }

  private handleWithdraw(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === COMPOUND_WITHDRAW_TOPIC);
    if (!log) return this.fallback('Withdrew from Compound V3', 'contract_interaction');

    try {
      const decoded = decodeEventLog({
        abi: WITHDRAW_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Withdraw',
      });
      const args = decoded.args as { src: string; to: string; amount: bigint };
      const asset: AssetAmount = {
        address: log.address.toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount, 18),
        amount_raw: args.amount.toString(),
      };
      return {
        type: 'contract_interaction',
        protocol: 'compound-v3',
        protocol_version: 'v3',
        summary: `Withdrew from Compound V3`,
        assets_in: [asset],
        assets_out: [],
      };
    } catch { return this.fallback('Withdrew from Compound V3', 'contract_interaction'); }
  }

  private fallback(summary: string, type: DecodedTransaction['type']): Partial<DecodedTransaction> {
    return { type, protocol: 'compound-v3', protocol_version: 'v3', summary, assets_in: [], assets_out: [] };
  }
}
