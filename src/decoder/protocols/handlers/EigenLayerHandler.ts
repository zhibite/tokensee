import { decodeEventLog } from 'viem';
import type { IProtocolHandler } from '../../../types/protocol.types.js';
import type { PipelineContext } from '../../../types/pipeline.types.js';
import type { DecodedTransaction, AssetAmount } from '../../../types/transaction.types.js';
import { ERC20_TRANSFER_TOPIC } from '../../../config/chains.config.js';
import { formatAmount } from '../../semantic/formatters.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const erc20Abi = require('../../abi/abis/erc20.json');
const ERC20_ABI = erc20Abi as Parameters<typeof decodeEventLog>[0]['abi'];

// EigenLayer StrategyManager / DelegationManager function names
const DEPOSIT_FUNCTIONS = ['depositIntoStrategy', 'depositIntoStrategyWithSignature'];
const WITHDRAW_FUNCTIONS = [
  'queueWithdrawals',
  'completeQueuedWithdrawal',
  'completeQueuedWithdrawals',
];
const DELEGATE_FUNCTIONS = [
  'delegateTo',
  'delegateToBySignature',
  'undelegate',
];

const ALL_FUNCTIONS = [...DEPOSIT_FUNCTIONS, ...WITHDRAW_FUNCTIONS, ...DELEGATE_FUNCTIONS];

// EigenLayer Deposit event: (staker, token, strategy, shares)
const EIGENLAYER_DEPOSIT_TOPIC =
  '0x7cfff908a4b583f36430b25d75964c458d8ede8a99bd61be750e97ee1b2f3a96';

const EIGENLAYER_DEPOSIT_EVENT_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'staker', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'strategy', type: 'address', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
] as const;

export class EigenLayerHandler implements IProtocolHandler {
  readonly protocolId = 'eigenlayer';

  canHandle(functionName: string): boolean {
    return ALL_FUNCTIONS.includes(functionName);
  }

  async buildSemantic(ctx: PipelineContext): Promise<Partial<DecodedTransaction>> {
    const { raw, decoded } = ctx;
    if (!raw) return {};

    const fnName = decoded?.function_name ?? '';

    if (DEPOSIT_FUNCTIONS.includes(fnName)) {
      return this.handleDeposit(ctx);
    }

    if (WITHDRAW_FUNCTIONS.includes(fnName)) {
      return this.handleWithdraw(ctx);
    }

    if (DELEGATE_FUNCTIONS.includes(fnName)) {
      const action = fnName === 'undelegate' ? 'Undelegate from operator' : 'Delegate to operator';
      return {
        type: 'other',
        protocol: 'eigenlayer',
        summary: `${action} on EigenLayer`,
      };
    }

    return { type: 'other', protocol: 'eigenlayer', summary: 'EigenLayer interaction' };
  }

  private handleDeposit(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw } = ctx;
    if (!raw) return {};

    // Try to parse Deposit event for token + shares
    for (const log of raw.logs) {
      if (log.topics[0] !== EIGENLAYER_DEPOSIT_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: EIGENLAYER_DEPOSIT_EVENT_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Deposit',
        });
        const args = ev.args as { staker: string; token: string; strategy: string; shares: bigint };
        const sharesFormatted = formatAmount(args.shares, 18);
        const assetsIn: AssetAmount[] = [{
          address: args.token.toLowerCase(),
          symbol: 'UNKNOWN',
          decimals: 18,
          amount: sharesFormatted,
          amount_raw: args.shares.toString(),
        }];

        return {
          type: 'stake',
          protocol: 'eigenlayer',
          summary: `Restake into EigenLayer strategy`,
          assets_in: assetsIn,
        };
      } catch { /* continue */ }
    }

    // Fallback: look for ERC-20 Transfer from sender
    const assetsIn = this.extractInboundTransfers(ctx);
    const amountStr = assetsIn.length > 0 ? ` ${assetsIn[0].amount}` : '';
    return {
      type: 'stake',
      protocol: 'eigenlayer',
      summary: `Restake${amountStr} into EigenLayer`,
      assets_in: assetsIn,
    };
  }

  private handleWithdraw(ctx: PipelineContext): Partial<DecodedTransaction> {
    const { raw, decoded } = ctx;
    if (!raw) return {};

    const fnName = decoded?.function_name ?? '';

    if (fnName === 'queueWithdrawals') {
      return {
        type: 'unstake',
        protocol: 'eigenlayer',
        summary: 'Queue withdrawal from EigenLayer (7-day delay)',
      };
    }

    // completeQueuedWithdrawal — tokens flow back to user
    const assetsOut = this.extractOutboundTransfers(ctx);
    const amountStr = assetsOut.length > 0 ? ` ${assetsOut[0].amount}` : '';
    return {
      type: 'unstake',
      protocol: 'eigenlayer',
      summary: `Complete withdrawal${amountStr} from EigenLayer`,
      assets_out: assetsOut,
    };
  }

  private extractInboundTransfers(ctx: PipelineContext): AssetAmount[] {
    const { raw } = ctx;
    if (!raw) return [];
    const results: AssetAmount[] = [];
    for (const log of raw.logs) {
      if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Transfer',
        });
        const args = ev.args as { from: string; to: string; value: bigint };
        if (args.from.toLowerCase() === raw.from) {
          results.push({
            address: log.address.toLowerCase(),
            symbol: 'UNKNOWN',
            decimals: 18,
            amount: formatAmount(args.value, 18),
            amount_raw: args.value.toString(),
          });
        }
      } catch { /* skip */ }
    }
    return results;
  }

  private extractOutboundTransfers(ctx: PipelineContext): AssetAmount[] {
    const { raw } = ctx;
    if (!raw) return [];
    const results: AssetAmount[] = [];
    for (const log of raw.logs) {
      if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
      try {
        const ev = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          eventName: 'Transfer',
        });
        const args = ev.args as { from: string; to: string; value: bigint };
        if (args.to.toLowerCase() === raw.from) {
          results.push({
            address: log.address.toLowerCase(),
            symbol: 'UNKNOWN',
            decimals: 18,
            amount: formatAmount(args.value, 18),
            amount_raw: args.value.toString(),
          });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
