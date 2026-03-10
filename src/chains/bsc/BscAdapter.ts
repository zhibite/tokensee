import { type Hex, type Address, erc20Abi } from 'viem';
import type { IChainAdapter } from '../base/ChainAdapter.interface.js';
import type { RawTransaction, RawLog } from '../../types/chain.types.js';
import type { TokenMetadata } from '../../types/protocol.types.js';
import { rpcManager } from '../../services/rpc/RpcManager.js';
import { CacheService, CACHE_KEYS, TTL } from '../../services/cache/CacheService.js';
import { NATIVE_TOKEN_ADDRESS } from '../../config/chains.config.js';

const cache = new CacheService();

export class BscAdapter implements IChainAdapter {
  readonly chain = 'bsc' as const;
  readonly chainId = 56;

  async getTransaction(hash: string): Promise<RawTransaction> {
    const cached = await cache.get<RawTransaction>(CACHE_KEYS.rawTx('bsc', hash));
    if (cached) return cached;

    const [tx, receipt] = await Promise.all([
      rpcManager.call('bsc', (client) =>
        client.getTransaction({ hash: hash as Hex })
      ),
      rpcManager.call('bsc', (client) =>
        client.getTransactionReceipt({ hash: hash as Hex })
      ),
    ]);

    if (!tx || !receipt) {
      throw new Error(`Transaction not found: ${hash}`);
    }

    const blockTimestamp = await this.getBlockTimestamp(Number(tx.blockNumber));

    const raw: RawTransaction = {
      hash: tx.hash,
      chain: 'bsc',
      blockNumber: Number(tx.blockNumber),
      blockTimestamp,
      from: tx.from.toLowerCase(),
      to: tx.to ? tx.to.toLowerCase() : null,
      value: tx.value,
      input: tx.input,
      gasUsed: receipt.gasUsed,
      gasPrice: tx.gasPrice ?? 0n,
      status: receipt.status === 'success' ? 1 : 0,
      logs: receipt.logs.map((log, i) => ({
        address: log.address.toLowerCase(),
        topics: [...log.topics],
        data: log.data,
        logIndex: i,
        transactionHash: hash,
      } satisfies RawLog)),
    };

    await cache.set(CACHE_KEYS.rawTx('bsc', hash), raw, TTL.RAW_TX);
    return raw;
  }

  async getTokenMetadata(address: string): Promise<TokenMetadata> {
    const normalized = address.toLowerCase();
    const cached = await cache.get<TokenMetadata>(CACHE_KEYS.tokenMetadata('bsc', normalized));
    if (cached) return cached;

    if (normalized === NATIVE_TOKEN_ADDRESS) {
      return { address: normalized, symbol: 'BNB', decimals: 18, name: 'BNB' };
    }

    const [symbol, decimals, name] = await Promise.all([
      rpcManager.call('bsc', (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'symbol' })
      ),
      rpcManager.call('bsc', (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'decimals' })
      ),
      rpcManager.call('bsc', (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'name' })
      ),
    ]);

    const metadata: TokenMetadata = {
      address: normalized,
      symbol: symbol as string,
      decimals: Number(decimals),
      name: name as string,
    };

    await cache.set(CACHE_KEYS.tokenMetadata('bsc', normalized), metadata, TTL.TOKEN_METADATA);
    return metadata;
  }

  async isContractAddress(address: string): Promise<boolean> {
    const code = await rpcManager.call('bsc', (c) =>
      c.getBytecode({ address: address as Address })
    );
    return code !== undefined && code !== '0x';
  }

  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    const cacheKey = CACHE_KEYS.blockTimestamp('bsc', blockNumber);
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const block = await rpcManager.call('bsc', (c) =>
      c.getBlock({ blockNumber: BigInt(blockNumber) })
    );

    const timestamp = Number(block.timestamp);
    await cache.set(cacheKey, timestamp, TTL.BLOCK_TIMESTAMP);
    return timestamp;
  }
}
