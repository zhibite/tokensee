import { decodeEventLog, formatUnits } from 'viem';
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
import { buildTransferSummary, buildNativeTransferSummary } from '../../semantic/formatters.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json');

const ERC20_ABI = erc20Abi as Parameters<typeof decodeEventLog>[0]['abi'];

// Wrapped native token addresses (per chain)
const WRAPPED_NATIVE: Record<string, string> = {
  ethereum: WETH_ADDRESS_ETH,
  bsc: WBNB_ADDRESS_BSC,
};

export class GenericTransferHandler implements IProtocolHandler {
  readonly protocolId = 'generic-transfer';

  canHandle(functionName: string): boolean {
    return ['transfer', 'transferFrom'].includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw } = ctx;
    if (!raw) return { type: 'unknown', summary: 'Unknown transaction' };

    // Native ETH/BNB transfer (no calldata)
    if (raw.input === '0x' || raw.input === '') {
      return this.handleNativeTransfer(ctx);
    }

    // ERC-20 transfer — reconstruct from logs
    return this.handleTokenTransfer(ctx);
  }

  private handleNativeTransfer(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    const chain = raw.chain;
    const symbol = chain === 'ethereum' ? 'ETH' : 'BNB';
    const amount = formatUnits(raw.value, 18);

    return {
      type: 'transfer',
      protocol: null,
      summary: buildNativeTransferSummary({ amount, symbol, to: raw.to ?? '' }),
      assets_in: [],
      assets_out: [
        {
          address: NATIVE_TOKEN_ADDRESS,
          symbol,
          decimals: 18,
          amount,
          amount_raw: raw.value.toString(),
        } satisfies AssetAmount,
      ],
    };
  }

  private handleTokenTransfer(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    const transferLogs = raw.logs.filter(
      (log) => log.topics[0] === ERC20_TRANSFER_TOPIC
    );

    if (transferLogs.length === 0) {
      return { type: 'contract_interaction', summary: 'Contract interaction' };
    }

    // Find transfers from the sender
    const outboundTransfers = this.decodeTransferLogs(transferLogs).filter(
      (t) => t.from === raw.from
    );
    const inboundTransfers = this.decodeTransferLogs(transferLogs).filter(
      (t) => t.to === raw.from
    );

    if (outboundTransfers.length > 0) {
      const t = outboundTransfers[0];
      const amount = formatUnits(t.value, 18); // decimals resolved later by price service
      return {
        type: 'transfer',
        protocol: null,
        summary: buildTransferSummary({ amount, symbol: 'tokens', from: t.from, to: t.to }),
        assets_in: [],
        assets_out: [
          {
            address: t.tokenAddress,
            symbol: 'UNKNOWN',
            decimals: 18,
            amount,
            amount_raw: t.value.toString(),
          },
        ],
      };
    }

    void inboundTransfers; // future use
    return { type: 'contract_interaction', summary: 'Contract interaction' };
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
        // Not a standard Transfer event
      }
    }
    return results;
  }
}
