import { decodeEventLog, formatUnits } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import { formatAmount } from '../../semantic/formatters.js';

// GMX v1 PositionRouter / Router function names
const INCREASE_FUNCTIONS = [
  'createIncreasePosition',
  'createIncreasePositionETH',
  'increasePosition',
  'increasePositionETH',
];

const DECREASE_FUNCTIONS = [
  'createDecreasePosition',
  'decreasePosition',
];

const SWAP_FUNCTIONS = ['swap', 'swapETHToTokens', 'swapTokensToETH'];

// GMX IncreasePosition event: (account, collateralToken, indexToken, collateralDelta, sizeDelta, isLong, price, fee)
const GMX_INCREASE_POSITION_TOPIC =
  '0x2fe68525253654c21998f35787a8d0f361905ef647c854092430ab65f2f15022';

// GMX DecreasePosition event
const GMX_DECREASE_POSITION_TOPIC =
  '0x93d75d64d1f84fc6f430a64fc578bdd4c1e090e90ea2d51773e626d19de56d30';

// GMX Swap event: (account, tokenIn, tokenOut, amountIn, amountOut)
const GMX_SWAP_TOPIC =
  '0xcd3829a3813dc3cdd188fd3d01dcf3268c16be2fdd2dd21d0665418816e46062';

const GMX_INCREASE_EVENT_ABI = [
  {
    type: 'event',
    name: 'IncreasePosition',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: false },
      { name: 'collateralToken', type: 'address', indexed: false },
      { name: 'indexToken', type: 'address', indexed: false },
      { name: 'collateralDelta', type: 'uint256', indexed: false },
      { name: 'sizeDelta', type: 'uint256', indexed: false },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const;

const GMX_DECREASE_EVENT_ABI = [
  {
    type: 'event',
    name: 'DecreasePosition',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: false },
      { name: 'collateralToken', type: 'address', indexed: false },
      { name: 'indexToken', type: 'address', indexed: false },
      { name: 'collateralDelta', type: 'uint256', indexed: false },
      { name: 'sizeDelta', type: 'uint256', indexed: false },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const;

const GMX_SWAP_EVENT_ABI = [
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { name: 'account', type: 'address', indexed: false },
      { name: 'tokenIn', type: 'address', indexed: false },
      { name: 'tokenOut', type: 'address', indexed: false },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'amountOut', type: 'uint256', indexed: false },
    ],
  },
] as const;

export class GmxHandler implements IProtocolHandler {
  readonly protocolId = 'gmx';

  canHandle(functionName: string): boolean {
    return (
      INCREASE_FUNCTIONS.includes(functionName) ||
      DECREASE_FUNCTIONS.includes(functionName) ||
      SWAP_FUNCTIONS.includes(functionName)
    );
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, decoded } = ctx;
    if (!raw) return {};

    const fnName = decoded?.function_name ?? '';

    // --- Swap ---
    if (SWAP_FUNCTIONS.includes(fnName)) {
      return this.handleSwap(ctx);
    }

    // --- Increase Position (open/add to long or short) ---
    if (INCREASE_FUNCTIONS.includes(fnName)) {
      return this.handleIncreasePosition(ctx);
    }

    // --- Decrease Position (close/reduce position) ---
    if (DECREASE_FUNCTIONS.includes(fnName)) {
      return this.handleDecreasePosition(ctx);
    }

    return { type: 'other', protocol: 'gmx', summary: 'GMX interaction' };
  }

  private handleSwap(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    for (const log of raw.logs) {
      if (log.topics[0] !== GMX_SWAP_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: GMX_SWAP_EVENT_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Swap',
        });
        const args = ev.args as { account: string; tokenIn: string; tokenOut: string; amountIn: bigint; amountOut: bigint };
        const amountIn = formatUnits(args.amountIn, 18);
        const amountOut = formatUnits(args.amountOut, 18);
        const assetsIn: AssetAmount[] = [{
          address: args.tokenIn.toLowerCase(),
          symbol: 'UNKNOWN',
          decimals: 18,
          amount: amountIn,
          amount_raw: args.amountIn.toString(),
        }];
        const assetsOut: AssetAmount[] = [{
          address: args.tokenOut.toLowerCase(),
          symbol: 'UNKNOWN',
          decimals: 18,
          amount: amountOut,
          amount_raw: args.amountOut.toString(),
        }];
        return {
          type: 'swap',
          protocol: 'gmx',
          summary: `Swap via GMX`,
          assets_in: assetsIn,
          assets_out: assetsOut,
        };
      } catch { /* continue */ }
    }

    return { type: 'swap', protocol: 'gmx', summary: 'Swap via GMX' };
  }

  private handleIncreasePosition(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    for (const log of raw.logs) {
      if (log.topics[0] !== GMX_INCREASE_POSITION_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: GMX_INCREASE_EVENT_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'IncreasePosition',
        });
        const args = ev.args as {
          collateralToken: string; indexToken: string;
          collateralDelta: bigint; sizeDelta: bigint; isLong: boolean; price: bigint;
        };
        const direction = args.isLong ? 'Long' : 'Short';
        const sizeUsd = formatAmount(args.sizeDelta, 30); // GMX uses 30 decimals for USD
        const collateral = formatAmount(args.collateralDelta, 30);
        const summary = `Open ${direction} position on GMX — Size $${parseFloat(sizeUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

        return {
          type: 'other',
          protocol: 'gmx',
          summary,
          assets_in: [{
            address: args.collateralToken.toLowerCase(),
            symbol: 'UNKNOWN',
            decimals: 30,
            amount: collateral,
            amount_raw: args.collateralDelta.toString(),
          }],
        };
      } catch { /* continue */ }
    }

    return {
      type: 'other',
      protocol: 'gmx',
      summary: 'Open/increase position on GMX',
    };
  }

  private handleDecreasePosition(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    for (const log of raw.logs) {
      if (log.topics[0] !== GMX_DECREASE_POSITION_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: GMX_DECREASE_EVENT_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'DecreasePosition',
        });
        const args = ev.args as {
          collateralToken: string; indexToken: string;
          collateralDelta: bigint; sizeDelta: bigint; isLong: boolean; price: bigint;
        };
        const direction = args.isLong ? 'Long' : 'Short';
        const sizeUsd = formatAmount(args.sizeDelta, 30);
        const summary = `Close/reduce ${direction} position on GMX — Size $${parseFloat(sizeUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

        return {
          type: 'other',
          protocol: 'gmx',
          summary,
          assets_out: [{
            address: args.collateralToken.toLowerCase(),
            symbol: 'UNKNOWN',
            decimals: 30,
            amount: formatAmount(args.collateralDelta, 30),
            amount_raw: args.collateralDelta.toString(),
          }],
        };
      } catch { /* continue */ }
    }

    return {
      type: 'other',
      protocol: 'gmx',
      summary: 'Close/decrease position on GMX',
    };
  }
}
