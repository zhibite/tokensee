import { decodeEventLog, formatUnits } from 'viem';
import { createRequire } from 'module';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import type { RawLog } from '../../../types/chain.types.js';
import {
  ERC20_TRANSFER_TOPIC,
  NATIVE_TOKEN_ADDRESS,
  WETH_ADDRESS_ETH,
  WBNB_ADDRESS_BSC,
} from '../../../config/chains.config.js';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json') as Parameters<typeof decodeEventLog>[0]['abi'];

// Universal Router command IDs
const CMD = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const;

const WRAPPED_NATIVE: Record<string, string> = {
  ethereum: WETH_ADDRESS_ETH,
  bsc: WBNB_ADDRESS_BSC,
};

export class UniversalRouterHandler implements IProtocolHandler {
  readonly protocolId = 'uniswap-universal';

  canHandle(functionName: string): boolean {
    return functionName === 'execute';
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, abiDecodeResult } = ctx;
    if (!raw) return {};

    const wrappedNative = WRAPPED_NATIVE[raw.chain];
    const nativeSymbol = raw.chain === 'ethereum' ? 'ETH' : 'BNB';

    // Parse commands byte to understand what this tx does
    const commandsHex = abiDecodeResult?.args?.['0'] as string | undefined;
    const { hasV3Swap, hasV2Swap, hasWrapEth, hasUnwrapWeth } = this.parseCommands(commandsHex);

    // Reconstruct asset flow from Transfer events
    const transferLogs = raw.logs.filter((l) => l.topics[0] === ERC20_TRANSFER_TOPIC);
    const transfers = this.decodeTransfers(transferLogs);

    // tokens leaving sender's wallet = input assets
    const assetsIn: AssetAmount[] = [];
    // tokens arriving to sender's wallet = output assets
    const assetsOut: AssetAmount[] = [];

    // ETH sent with tx = wrapping into WETH as input
    if (raw.value > 0n || hasWrapEth) {
      assetsIn.push({
        address: NATIVE_TOKEN_ADDRESS,
        symbol: nativeSymbol,
        decimals: 18,
        amount: formatUnits(raw.value, 18),
        amount_raw: raw.value.toString(),
      });
    }

    for (const t of transfers) {
      // Skip WETH wrap/unwrap internals (router ↔ WETH contract)
      if (t.tokenAddress === wrappedNative && (t.from === raw.to || t.to === raw.to)) continue;

      if (t.from === raw.from) {
        // Sender sent tokens → asset in
        assetsIn.push({
          address: t.tokenAddress,
          symbol: 'UNKNOWN',
          decimals: 18,
          amount: formatUnits(t.value, 18),
          amount_raw: t.value.toString(),
        });
      } else if (t.to === raw.from) {
        // Sender received tokens → asset out
        const addr = t.tokenAddress === wrappedNative && hasUnwrapWeth
          ? NATIVE_TOKEN_ADDRESS  // WETH being unwrapped → show as ETH
          : t.tokenAddress;
        assetsOut.push({
          address: addr,
          symbol: addr === NATIVE_TOKEN_ADDRESS ? nativeSymbol : 'UNKNOWN',
          decimals: 18,
          amount: formatUnits(t.value, 18),
          amount_raw: t.value.toString(),
        });
      }
    }

    // If UNWRAP_WETH but no ETH Transfer found — ETH output amount unknown
    // (ETH doesn't emit Transfer events; amount will be enriched via balance diff in future)

    const swapVersion = hasV3Swap ? 'uniswap-v3' : hasV2Swap ? 'uniswap-v2' : 'uniswap-universal';

    const summary =
      assetsIn.length > 0 && assetsOut.length > 0
        ? `Swap via Uniswap Universal Router`
        : assetsIn.length > 0
        ? `Sent tokens via Uniswap Universal Router`
        : `Uniswap Universal Router interaction`;

    return {
      type: hasV3Swap || hasV2Swap ? 'swap' : 'unknown',
      protocol: swapVersion,
      protocol_version: swapVersion,
      summary,
      assets_in: assetsIn,
      assets_out: assetsOut,
    };
  }

  private parseCommands(commandsHex?: string) {
    if (!commandsHex) return { hasV3Swap: false, hasV2Swap: false, hasWrapEth: false, hasUnwrapWeth: false };

    const hex = commandsHex.startsWith('0x') ? commandsHex.slice(2) : commandsHex;
    const commands: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      commands.push(parseInt(hex.slice(i, i + 2), 16));
    }

    return {
      hasV3Swap: commands.some((c) => c === CMD.V3_SWAP_EXACT_IN || c === CMD.V3_SWAP_EXACT_OUT),
      hasV2Swap: commands.some((c) => c === CMD.V2_SWAP_EXACT_IN || c === CMD.V2_SWAP_EXACT_OUT),
      hasWrapEth: commands.some((c) => c === CMD.WRAP_ETH),
      hasUnwrapWeth: commands.some((c) => c === CMD.UNWRAP_WETH),
    };
  }

  private decodeTransfers(logs: RawLog[]) {
    const results: Array<{ from: string; to: string; value: bigint; tokenAddress: string }> = [];
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: erc20Abi,
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
