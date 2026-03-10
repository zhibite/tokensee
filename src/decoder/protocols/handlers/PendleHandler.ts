import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction } from '../../../types/transaction.types.js';
import { ERC20_TRANSFER_TOPIC } from '../../../config/chains.config.js';
import { decodeEventLog, formatUnits } from 'viem';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json');
const ERC20_ABI = erc20Abi as Parameters<typeof decodeEventLog>[0]['abi'];

// Pendle Router function names
const PT_FUNCTIONS = [
  'swapExactTokenForPt',
  'swapExactSyForPt',
  'swapExactPtForToken',
  'swapExactPtForSy',
];

const YT_FUNCTIONS = [
  'swapExactTokenForYt',
  'swapExactSyForYt',
  'swapExactYtForToken',
  'swapExactYtForSy',
];

const LP_FUNCTIONS = [
  'addLiquidityDualTokenAndPt',
  'addLiquidityDualSyAndPt',
  'addLiquiditySingleToken',
  'addLiquiditySingleSy',
  'removeLiquidityDualTokenAndPt',
  'removeLiquidityDualSyAndPt',
  'removeLiquiditySingleToken',
  'removeLiquiditySingleSy',
];

const MINT_REDEEM_FUNCTIONS = [
  'mintPyFromToken',
  'mintPyFromSy',
  'redeemPyToToken',
  'redeemPyToSy',
  'mintSyFromToken',
  'redeemSyToToken',
];

const ALL_FUNCTIONS = [...PT_FUNCTIONS, ...YT_FUNCTIONS, ...LP_FUNCTIONS, ...MINT_REDEEM_FUNCTIONS];

export class PendleHandler implements IProtocolHandler {
  readonly protocolId = 'pendle';

  canHandle(functionName: string): boolean {
    return ALL_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, decoded } = ctx;
    if (!raw) return {};

    const fnName = decoded?.function_name ?? '';

    // Infer action category
    let actionLabel: string;
    let txType: DecodedTransaction['type'] = 'other';

    if (PT_FUNCTIONS.includes(fnName)) {
      actionLabel = fnName.includes('ForPt') ? 'Buy PT' : 'Sell PT';
      txType = 'swap';
    } else if (YT_FUNCTIONS.includes(fnName)) {
      actionLabel = fnName.includes('ForYt') ? 'Buy YT' : 'Sell YT';
      txType = 'swap';
    } else if (LP_FUNCTIONS.includes(fnName)) {
      actionLabel = fnName.startsWith('add') ? 'Add liquidity' : 'Remove liquidity';
      txType = fnName.startsWith('add') ? 'liquidity_add' : 'liquidity_remove';
    } else if (MINT_REDEEM_FUNCTIONS.includes(fnName)) {
      actionLabel = fnName.startsWith('mint') ? 'Mint' : 'Redeem';
      txType = 'other';
    } else {
      actionLabel = 'Pendle interaction';
    }

    // Read transfer logs to understand token flows
    const transferLogs = raw.logs.filter((l) => l.topics[0] === ERC20_TRANSFER_TOPIC);
    const sender = raw.from;
    let tokenIn = '';
    let tokenOut = '';
    let amountIn = 0n;
    let amountOut = 0n;

    for (const log of transferLogs) {
      try {
        const ev = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Transfer',
        });
        const args = ev.args as { from: string; to: string; value: bigint };
        if (args.from.toLowerCase() === sender) {
          tokenIn = log.address;
          amountIn = args.value;
        } else if (args.to.toLowerCase() === sender) {
          tokenOut = log.address;
          amountOut = args.value;
        }
      } catch { /* skip */ }
    }

    let summary = `${actionLabel} via Pendle`;
    if (amountIn > 0n && amountOut > 0n) {
      const inAmt = parseFloat(formatUnits(amountIn, 18)).toFixed(4);
      const outAmt = parseFloat(formatUnits(amountOut, 18)).toFixed(4);
      summary = `${actionLabel} via Pendle — ${inAmt} → ${outAmt}`;
    }

    const result: Partial<DecodedTransaction> = {
      type: txType,
      protocol: 'pendle',
      summary,
    };

    if (tokenIn && amountIn > 0n) {
      result.assets_in = [{
        address: tokenIn.toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatUnits(amountIn, 18),
        amount_raw: amountIn.toString(),
      }];
    }

    if (tokenOut && amountOut > 0n) {
      result.assets_out = [{
        address: tokenOut.toLowerCase(),
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatUnits(amountOut, 18),
        amount_raw: amountOut.toString(),
      }];
    }

    return result;
  }
}
