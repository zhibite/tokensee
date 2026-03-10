import { decodeEventLog, formatUnits } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import type { RawLog } from '../../../types/chain.types.js';
import {
  ERC20_TRANSFER_TOPIC,
  UNISWAP_V3_SWAP_TOPIC,
  NATIVE_TOKEN_ADDRESS,
  WETH_ADDRESS_ETH,
  WBNB_ADDRESS_BSC,
} from '../../../config/chains.config.js';
import { buildSwapSummary, formatAmount } from '../../semantic/formatters.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json');
const ERC20_ABI = erc20Abi as Parameters<typeof decodeEventLog>[0]['abi'];

const SWAP_FUNCTIONS = [
  'exactInputSingle',
  'exactInput',
  'exactOutputSingle',
  'exactOutput',
  'multicall',
];

const WRAPPED_NATIVE: Record<string, string> = {
  ethereum: WETH_ADDRESS_ETH,
  bsc: WBNB_ADDRESS_BSC,
};

export class UniswapV3Handler implements IProtocolHandler {
  readonly protocolId = 'uniswap-v3';

  canHandle(functionName: string): boolean {
    return SWAP_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw } = ctx;
    if (!raw) return {};

    const wrappedNative = WRAPPED_NATIVE[raw.chain];

    // Reconstruct assets from ERC-20 Transfer logs (actual amounts, not slippage limits)
    const transferLogs = raw.logs.filter((l) => l.topics[0] === ERC20_TRANSFER_TOPIC);
    const decoded = this.decodeTransferLogs(transferLogs);

    // User sent tokens out: from == sender
    // User received tokens: to == sender
    // Native ETH in: tx.value > 0
    let assetsIn: AssetAmount[] = [];
    let assetsOut: AssetAmount[] = [];

    if (raw.value > 0n) {
      // User swapped native ETH/BNB in
      const symbol = raw.chain === 'ethereum' ? 'ETH' : 'BNB';
      assetsIn.push({
        address: NATIVE_TOKEN_ADDRESS,
        symbol,
        decimals: 18,
        amount: formatAmount(raw.value, 18),
        amount_raw: raw.value.toString(),
      });
    } else {
      // Look for tokens going OUT from sender
      assetsIn = decoded
        .filter((t) => t.from === raw.from)
        .map((t) => ({
          address: t.tokenAddress === wrappedNative ? NATIVE_TOKEN_ADDRESS : t.tokenAddress,
          symbol: 'UNKNOWN',
          decimals: 18,
          amount: formatAmount(t.value, 18),
          amount_raw: t.value.toString(),
        }));
    }

    // Tokens coming IN to sender
    assetsOut = decoded
      .filter((t) => t.to === raw.from)
      .map((t) => ({
        address: t.tokenAddress === wrappedNative ? NATIVE_TOKEN_ADDRESS : t.tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        amount: formatAmount(t.value, 18),
        amount_raw: t.value.toString(),
      }));

    // Also check for ETH refund (WETH unwrap to user)
    // This is handled by the Transfer event to === sender already

    const summary =
      assetsIn.length > 0 && assetsOut.length > 0
        ? buildSwapSummary({
            amountIn: assetsIn[0].amount,
            symbolIn: assetsIn[0].symbol,
            amountOut: assetsOut[0].amount,
            symbolOut: assetsOut[0].symbol,
            protocol: 'uniswap-v3',
          })
        : 'Swap via Uniswap V3';

    return {
      type: 'swap',
      protocol: 'uniswap-v3',
      protocol_version: 'v3',
      summary,
      assets_in: assetsIn,
      assets_out: assetsOut,
    };
  }

  private decodeTransferLogs(logs: RawLog[]): Array<{
    from: string;
    to: string;
    value: bigint;
    tokenAddress: string;
  }> {
    const results = [];
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Transfer',
        });
        const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
        results.push({ from: from.toLowerCase(), to: to.toLowerCase(), value, tokenAddress: log.address });
      } catch {
        // skip
      }
    }
    return results;
  }
}
