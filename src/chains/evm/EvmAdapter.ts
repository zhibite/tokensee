/**
 * Generic EVM adapter — works for any chain supported by viem + RpcManager.
 * Used for Arbitrum, Polygon, and Base.
 */

import { type Hex, type Address, erc20Abi } from 'viem';
import type { IChainAdapter } from '../base/ChainAdapter.interface.js';
import type { RawTransaction, RawLog, SupportedChain } from '../../types/chain.types.js';
import type { TokenMetadata } from '../../types/protocol.types.js';
import { rpcManager } from '../../services/rpc/RpcManager.js';
import { CacheService, CACHE_KEYS, TTL } from '../../services/cache/CacheService.js';
import { NATIVE_TOKEN_ADDRESS } from '../../config/chains.config.js';

const NATIVE_INFO: Record<string, { symbol: string; name: string }> = {
  ethereum:  { symbol: 'ETH',  name: 'Ethereum' },
  bsc:       { symbol: 'BNB',  name: 'BNB Chain' },
  arbitrum:  { symbol: 'ETH',  name: 'Ethereum' },
  polygon:   { symbol: 'MATIC', name: 'Polygon' },
  base:      { symbol: 'ETH',  name: 'Ethereum' },
  optimism:  { symbol: 'ETH',  name: 'Ethereum' },
  avalanche: { symbol: 'AVAX', name: 'Avalanche' },
  zksync:    { symbol: 'ETH',  name: 'Ethereum' },
  linea:     { symbol: 'ETH',  name: 'Ethereum' },
  scroll:    { symbol: 'ETH',  name: 'Ethereum' },
  zkevm:     { symbol: 'ETH',  name: 'Ethereum' },
  mantle:    { symbol: 'MNT',  name: 'Mantle' },
  gnosis:    { symbol: 'xDAI', name: 'Gnosis' },
  metis:     { symbol: 'METIS', name: 'Metis' },
  boba:      { symbol: 'ETH',  name: 'Ethereum' },
  blast:     { symbol: 'ETH',  name: 'Ethereum' },
  mode:      { symbol: 'ETH',  name: 'Ethereum' },
};

export class EvmAdapter implements IChainAdapter {
  readonly chain: SupportedChain;
  readonly chainId: number;

  private readonly cache: CacheService;

  constructor(chain: SupportedChain, chainId: number) {
    this.chain = chain;
    this.chainId = chainId;
    this.cache = new CacheService();
  }

  async getTransaction(hash: string): Promise<RawTransaction> {
    const cached = await this.cache.get<RawTransaction>(CACHE_KEYS.rawTx(this.chain, hash));
    if (cached) return cached;

    const [tx, receipt] = await Promise.all([
      rpcManager.call(this.chain, (c) => c.getTransaction({ hash: hash as Hex })),
      rpcManager.call(this.chain, (c) => c.getTransactionReceipt({ hash: hash as Hex })),
    ]);

    if (!tx || !receipt) throw new Error(`Transaction not found: ${hash}`);

    const blockTimestamp = await this.getBlockTimestamp(Number(tx.blockNumber));

    const raw: RawTransaction = {
      hash: tx.hash,
      chain: this.chain,
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

    await this.cache.set(CACHE_KEYS.rawTx(this.chain, hash), raw, TTL.RAW_TX);
    return raw;
  }

  async getTokenMetadata(address: string): Promise<TokenMetadata> {
    const normalized = address.toLowerCase();
    const cached = await this.cache.get<TokenMetadata>(CACHE_KEYS.tokenMetadata(this.chain, normalized));
    if (cached) return cached;

    if (normalized === NATIVE_TOKEN_ADDRESS) {
      const { symbol, name } = NATIVE_INFO[this.chain] ?? { symbol: 'ETH', name: 'Ethereum' };
      return { address: normalized, symbol, decimals: 18, name };
    }

    const [symbol, decimals, name] = await Promise.all([
      rpcManager.call(this.chain, (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'symbol' })
      ),
      rpcManager.call(this.chain, (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'decimals' })
      ),
      rpcManager.call(this.chain, (c) =>
        c.readContract({ address: address as Address, abi: erc20Abi, functionName: 'name' })
      ),
    ]);

    const metadata: TokenMetadata = {
      address: normalized,
      symbol: symbol as string,
      decimals: Number(decimals),
      name: name as string,
    };

    await this.cache.set(CACHE_KEYS.tokenMetadata(this.chain, normalized), metadata, TTL.TOKEN_METADATA);
    return metadata;
  }

  async isContractAddress(address: string): Promise<boolean> {
    const code = await rpcManager.call(this.chain, (c) =>
      c.getBytecode({ address: address as Address })
    );
    return code !== undefined && code !== '0x';
  }

  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    const cacheKey = CACHE_KEYS.blockTimestamp(this.chain, blockNumber);
    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const block = await rpcManager.call(this.chain, (c) =>
      c.getBlock({ blockNumber: BigInt(blockNumber) })
    );

    const timestamp = Number(block.timestamp);
    await this.cache.set(cacheKey, timestamp, TTL.BLOCK_TIMESTAMP);
    return timestamp;
  }
}
