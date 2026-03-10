import { decodeEventLog } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import type { RawLog } from '../../../types/chain.types.js';
import { ERC20_TRANSFER_TOPIC } from '../../../config/chains.config.js';
import { buildSwapSummary, formatAmount } from '../../semantic/formatters.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json');
const ERC20_ABI = erc20Abi as Parameters<typeof decodeEventLog>[0]['abi'];

// Curve stable swap exchange (int128 index variant)
const CURVE_TOKEN_EXCHANGE_TOPIC =
  '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140';
// Curve crypto swap exchange (uint256 index variant)
const CURVE_TOKEN_EXCHANGE_U_TOPIC =
  '0xb2e76ae99761dc136e598d4a629bb347eccb9532a5f8bbd72e18467c3c34cc98';

const CURVE_FUNCTIONS = [
  'exchange', 'exchange_underlying', 'exchange_with_best_rate',
  'add_liquidity', 'remove_liquidity', 'remove_liquidity_one_coin', 'remove_liquidity_imbalance',
];

export class CurveHandler implements IProtocolHandler {
  readonly protocolId = 'curve';

  canHandle(functionName: string): boolean {
    return CURVE_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, abiDecodeResult } = ctx;
    if (!raw) return {};

    const fn = abiDecodeResult?.functionName ?? '';

    if (fn.startsWith('add_liquidity')) return this.handleAddLiquidity(raw.logs, raw.from);
    if (fn.startsWith('remove_liquidity')) return this.handleRemoveLiquidity(raw.logs, raw.from);

    // Default: exchange
    return this.handleExchange(raw.logs, raw.from);
  }

  private handleExchange(logs: RawLog[], sender: string): Partial<DecodedTransaction> {
    // Use ERC-20 Transfer events to reconstruct assets (same approach as UniswapV3)
    const transfers = this.decodeTransfers(logs);
    const assetsIn = transfers
      .filter((t) => t.from === sender)
      .map((t): AssetAmount => ({
        address: t.tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(t.value, 18),
        amount_raw: t.value.toString(),
      }));
    const assetsOut = transfers
      .filter((t) => t.to === sender)
      .map((t): AssetAmount => ({
        address: t.tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(t.value, 18),
        amount_raw: t.value.toString(),
      }));

    const summary =
      assetsIn.length > 0 && assetsOut.length > 0
        ? buildSwapSummary({
            amountIn: assetsIn[0].amount,
            symbolIn: assetsIn[0].symbol,
            amountOut: assetsOut[0].amount,
            symbolOut: assetsOut[0].symbol,
            protocol: 'curve',
          })
        : 'Swapped via Curve';

    return {
      type: 'swap',
      protocol: 'curve',
      protocol_version: 'v1',
      summary,
      assets_in: assetsIn,
      assets_out: assetsOut,
    };
  }

  private handleAddLiquidity(logs: RawLog[], sender: string): Partial<DecodedTransaction> {
    const transfers = this.decodeTransfers(logs);
    const assetsOut = transfers
      .filter((t) => t.from === sender)
      .map((t): AssetAmount => ({
        address: t.tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(t.value, 18),
        amount_raw: t.value.toString(),
      }));
    return {
      type: 'liquidity_add',
      protocol: 'curve',
      protocol_version: 'v1',
      summary: `Added liquidity to Curve pool`,
      assets_out: assetsOut,
      assets_in: [],
    };
  }

  private handleRemoveLiquidity(logs: RawLog[], sender: string): Partial<DecodedTransaction> {
    const transfers = this.decodeTransfers(logs);
    const assetsIn = transfers
      .filter((t) => t.to === sender)
      .map((t): AssetAmount => ({
        address: t.tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(t.value, 18),
        amount_raw: t.value.toString(),
      }));
    return {
      type: 'liquidity_remove',
      protocol: 'curve',
      protocol_version: 'v1',
      summary: `Removed liquidity from Curve pool`,
      assets_in: assetsIn,
      assets_out: [],
    };
  }

  private decodeTransfers(logs: RawLog[]): Array<{ from: string; to: string; value: bigint; tokenAddress: string }> {
    const results = [];
    for (const log of logs.filter((l) => l.topics[0] === ERC20_TRANSFER_TOPIC)) {
      try {
        const decoded = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Transfer',
        });
        const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
        results.push({ from: from.toLowerCase(), to: to.toLowerCase(), value, tokenAddress: log.address });
      } catch { /* skip */ }
    }
    return results;
  }
}
