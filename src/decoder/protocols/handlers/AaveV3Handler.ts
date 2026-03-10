import { decodeEventLog, formatUnits } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import type { RawLog } from '../../../types/chain.types.js';
import { formatAmount } from '../../semantic/formatters.js';

// Aave V3 Pool event topic hashes
const AAVE_SUPPLY_TOPIC   = '0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61';
const AAVE_BORROW_TOPIC   = '0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0';
const AAVE_REPAY_TOPIC    = '0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051';
const AAVE_WITHDRAW_TOPIC = '0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7';
const AAVE_LIQUIDATION_TOPIC = '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';

// Minimal ABIs for event decoding
const SUPPLY_ABI = [{
  type: 'event', name: 'Supply',
  inputs: [
    { name: 'reserve', type: 'address', indexed: true },
    { name: 'user', type: 'address', indexed: false },
    { name: 'onBehalfOf', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'referralCode', type: 'uint16', indexed: true },
  ],
}] as const;

const BORROW_ABI = [{
  type: 'event', name: 'Borrow',
  inputs: [
    { name: 'reserve', type: 'address', indexed: true },
    { name: 'user', type: 'address', indexed: false },
    { name: 'onBehalfOf', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'interestRateMode', type: 'uint8', indexed: false },
    { name: 'borrowRate', type: 'uint256', indexed: false },
    { name: 'referralCode', type: 'uint16', indexed: true },
  ],
}] as const;

const REPAY_ABI = [{
  type: 'event', name: 'Repay',
  inputs: [
    { name: 'reserve', type: 'address', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'repayer', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'useATokens', type: 'bool', indexed: false },
  ],
}] as const;

const WITHDRAW_ABI = [{
  type: 'event', name: 'Withdraw',
  inputs: [
    { name: 'reserve', type: 'address', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ],
}] as const;

const LIQUIDATION_ABI = [{
  type: 'event', name: 'LiquidationCall',
  inputs: [
    { name: 'collateralAsset', type: 'address', indexed: true },
    { name: 'debtAsset', type: 'address', indexed: true },
    { name: 'user', type: 'address', indexed: true },
    { name: 'debtToCover', type: 'uint256', indexed: false },
    { name: 'liquidatedCollateralAmount', type: 'uint256', indexed: false },
    { name: 'liquidator', type: 'address', indexed: false },
    { name: 'receiveAToken', type: 'bool', indexed: false },
  ],
}] as const;

const AAVE_FUNCTIONS = [
  'supply', 'supplyWithPermit',
  'borrow',
  'repay', 'repayWithPermit', 'repayWithATokens',
  'withdraw',
  'liquidationCall',
];

export class AaveV3Handler implements IProtocolHandler {
  readonly protocolId = 'aave-v3';

  canHandle(functionName: string): boolean {
    return AAVE_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw } = ctx;
    if (!raw) return {};

    const topics0 = raw.logs.map((l) => l.topics[0]);

    if (topics0.includes(AAVE_SUPPLY_TOPIC))   return this.handleSupply(raw.logs, raw.from);
    if (topics0.includes(AAVE_BORROW_TOPIC))   return this.handleBorrow(raw.logs, raw.from);
    if (topics0.includes(AAVE_REPAY_TOPIC))    return this.handleRepay(raw.logs, raw.from);
    if (topics0.includes(AAVE_WITHDRAW_TOPIC)) return this.handleWithdraw(raw.logs, raw.from);
    if (topics0.includes(AAVE_LIQUIDATION_TOPIC)) return this.handleLiquidation(raw.logs);

    return {
      type: 'contract_interaction',
      protocol: 'aave-v3',
      protocol_version: 'v3',
      summary: 'Aave V3 interaction',
    };
  }

  private handleSupply(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === AAVE_SUPPLY_TOPIC);
    if (!log) return {};
    try {
      const { args } = decodeEventLog({
        abi: SUPPLY_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Supply',
      });
      const asset: AssetAmount = {
        address: (args.reserve as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount as bigint, 18),
        amount_raw: (args.amount as bigint).toString(),
      };
      return {
        type: 'contract_interaction',
        protocol: 'aave-v3',
        protocol_version: 'v3',
        summary: `Supplied ${formatUnits(args.amount as bigint, 18)} to Aave V3`,
        assets_out: [asset],
        assets_in: [],
      };
    } catch { return this.fallback('Supplied to Aave V3'); }
  }

  private handleBorrow(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === AAVE_BORROW_TOPIC);
    if (!log) return {};
    try {
      const { args } = decodeEventLog({
        abi: BORROW_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Borrow',
      });
      const asset: AssetAmount = {
        address: (args.reserve as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount as bigint, 18),
        amount_raw: (args.amount as bigint).toString(),
      };
      return {
        type: 'borrow',
        protocol: 'aave-v3',
        protocol_version: 'v3',
        summary: `Borrowed ${formatUnits(args.amount as bigint, 18)} from Aave V3`,
        assets_in: [asset],
        assets_out: [],
      };
    } catch { return this.fallback('Borrowed from Aave V3'); }
  }

  private handleRepay(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === AAVE_REPAY_TOPIC);
    if (!log) return {};
    try {
      const { args } = decodeEventLog({
        abi: REPAY_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Repay',
      });
      const asset: AssetAmount = {
        address: (args.reserve as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount as bigint, 18),
        amount_raw: (args.amount as bigint).toString(),
      };
      return {
        type: 'repay',
        protocol: 'aave-v3',
        protocol_version: 'v3',
        summary: `Repaid ${formatUnits(args.amount as bigint, 18)} on Aave V3`,
        assets_out: [asset],
        assets_in: [],
      };
    } catch { return this.fallback('Repaid on Aave V3'); }
  }

  private handleWithdraw(logs: RawLog[], _from: string): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === AAVE_WITHDRAW_TOPIC);
    if (!log) return {};
    try {
      const { args } = decodeEventLog({
        abi: WITHDRAW_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Withdraw',
      });
      const asset: AssetAmount = {
        address: (args.reserve as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.amount as bigint, 18),
        amount_raw: (args.amount as bigint).toString(),
      };
      return {
        type: 'contract_interaction',
        protocol: 'aave-v3',
        protocol_version: 'v3',
        summary: `Withdrew ${formatUnits(args.amount as bigint, 18)} from Aave V3`,
        assets_in: [asset],
        assets_out: [],
      };
    } catch { return this.fallback('Withdrew from Aave V3'); }
  }

  private handleLiquidation(logs: RawLog[]): Partial<DecodedTransaction> {
    const log = logs.find((l) => l.topics[0] === AAVE_LIQUIDATION_TOPIC);
    if (!log) return this.fallback('Aave V3 liquidation');
    try {
      const { args } = decodeEventLog({
        abi: LIQUIDATION_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'LiquidationCall',
      });
      const debt: AssetAmount = {
        address: (args.debtAsset as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.debtToCover as bigint, 18),
        amount_raw: (args.debtToCover as bigint).toString(),
      };
      const collateral: AssetAmount = {
        address: (args.collateralAsset as string).toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(args.liquidatedCollateralAmount as bigint, 18),
        amount_raw: (args.liquidatedCollateralAmount as bigint).toString(),
      };
      return {
        type: 'contract_interaction',
        protocol: 'aave-v3',
        protocol_version: 'v3',
        summary: `Aave V3 liquidation — covered debt, seized collateral`,
        assets_out: [debt],
        assets_in: [collateral],
      };
    } catch { return this.fallback('Aave V3 liquidation'); }
  }

  private fallback(summary: string): Partial<DecodedTransaction> {
    return {
      type: 'contract_interaction',
      protocol: 'aave-v3',
      protocol_version: 'v3',
      summary,
      assets_in: [],
      assets_out: [],
    };
  }
}
