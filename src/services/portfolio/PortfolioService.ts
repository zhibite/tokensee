import axios from 'axios';
import { formatUnits, type Address } from 'viem';
import { env } from '../../config/index.js';
import { rpcManager } from '../rpc/RpcManager.js';
import { priceService } from '../price/PriceService.js';
import { CacheService, TTL } from '../cache/CacheService.js';
import { NATIVE_TOKEN_ADDRESS } from '../../config/chains.config.js';
import type { SupportedChain } from '../../types/chain.types.js';

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;       // human-readable
  balance_raw: string;   // raw string
  price_usd: string | null;
  value_usd: string | null;
  logo?: string;
}

export interface ChainPortfolio {
  chain: SupportedChain;
  native: TokenBalance;
  tokens: TokenBalance[];
  total_value_usd: string | null;
}

export interface Portfolio {
  address: string;
  chains: ChainPortfolio[];
  total_value_usd: string | null;
}

const cache = new CacheService('portfolio');

export class PortfolioService {
  async getPortfolio(address: string, chains: SupportedChain[]): Promise<Portfolio> {
    const cacheKey = `portfolio:${address}:${chains.join(',')}`;
    const cached = await cache.get<Portfolio>(cacheKey);
    if (cached) return cached;

    const chainPortfolios = await Promise.all(
      chains.map((chain) => this.getChainPortfolio(address, chain))
    );

    const totalUsd = chainPortfolios.reduce((sum, cp) => {
      if (cp.total_value_usd === null) return sum;
      return sum === null ? parseFloat(cp.total_value_usd) : sum + parseFloat(cp.total_value_usd);
    }, null as number | null);

    const portfolio: Portfolio = {
      address: address.toLowerCase(),
      chains: chainPortfolios,
      total_value_usd: totalUsd !== null ? totalUsd.toFixed(2) : null,
    };

    await cache.set(cacheKey, portfolio, TTL.TOKEN_METADATA);
    return portfolio;
  }

  private async getChainPortfolio(address: string, chain: SupportedChain): Promise<ChainPortfolio> {
    const [native, tokens] = await Promise.all([
      this.getNativeBalance(address, chain),
      this.getTokenBalances(address, chain),
    ]);

    const allValues = [native, ...tokens]
      .map((t) => t.value_usd ? parseFloat(t.value_usd) : null)
      .filter((v): v is number => v !== null);

    const totalUsd = allValues.length > 0
      ? allValues.reduce((a, b) => a + b, 0).toFixed(2)
      : null;

    return { chain, native, tokens, total_value_usd: totalUsd };
  }

  private async getNativeBalance(address: string, chain: SupportedChain): Promise<TokenBalance> {
    const balanceWei = await rpcManager.call(chain, (c) =>
      c.getBalance({ address: address as Address })
    );

    const NATIVE: Record<SupportedChain, { symbol: string; name: string }> = {
      ethereum:  { symbol: 'ETH',   name: 'Ethereum' },
      bsc:       { symbol: 'BNB',   name: 'BNB' },
      arbitrum:  { symbol: 'ETH',   name: 'Ethereum' },
      polygon:   { symbol: 'MATIC', name: 'Polygon' },
      base:      { symbol: 'ETH',   name: 'Ethereum' },
      optimism:  { symbol: 'ETH',   name: 'Ethereum' },
      avalanche: { symbol: 'AVAX',  name: 'Avalanche' },
      zksync:    { symbol: 'ETH',   name: 'Ethereum' },
      linea:     { symbol: 'ETH',   name: 'Ethereum' },
      scroll:    { symbol: 'ETH',   name: 'Ethereum' },
      zkevm:     { symbol: 'ETH',   name: 'Ethereum' },
      mantle:    { symbol: 'MNT',   name: 'Mantle' },
      gnosis:    { symbol: 'xDAI',  name: 'Gnosis' },
      metis:     { symbol: 'METIS', name: 'Metis' },
      boba:      { symbol: 'ETH',   name: 'Ethereum' },
      blast:     { symbol: 'ETH',   name: 'Ethereum' },
      mode:      { symbol: 'ETH',   name: 'Ethereum' },
    };
    const { symbol, name } = NATIVE[chain];
    const balance = formatUnits(balanceWei, 18);
    const price = await priceService.getPrice(symbol);
    const valueUsd = price ? (parseFloat(balance) * price).toFixed(2) : null;

    return {
      address: NATIVE_TOKEN_ADDRESS,
      symbol,
      name,
      decimals: 18,
      balance,
      balance_raw: balanceWei.toString(),
      price_usd: price ? price.toFixed(2) : null,
      value_usd: valueUsd,
    };
  }

  private async getTokenBalances(address: string, chain: SupportedChain): Promise<TokenBalance[]> {
    if (chain === 'bsc') return this.getTokenBalancesBscScan(address);
    // Ethereum, Arbitrum, Polygon, Base — all supported by Alchemy
    const ALCHEMY_NETWORK: Partial<Record<SupportedChain, string>> = {
      ethereum: `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      arbitrum: env.ALCHEMY_ARBITRUM_URL ?? `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      polygon:  env.ALCHEMY_POLYGON_URL  ?? `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      base:     env.ALCHEMY_BASE_URL     ?? `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    };
    const alchemyUrl = ALCHEMY_NETWORK[chain];
    if (alchemyUrl) return this.getTokenBalancesAlchemy(address, alchemyUrl);
    return [];
  }

  private async getTokenBalancesBscScan(address: string): Promise<TokenBalance[]> {
    if (!env.BSCSCAN_API_KEY) return [];
    try {
      const url = `https://api.bscscan.com/api?module=account&action=tokenlist&address=${address}&apikey=${env.BSCSCAN_API_KEY}`;
      const response = await axios.get<{
        status: string;
        result: Array<{
          contractAddress: string;
          tokenName: string;
          symbol: string;
          tokenDecimal: string;
          tokenQuantity: string;
        }>;
      }>(url, { timeout: 10000 });

      if (response.data.status !== '1' || !Array.isArray(response.data.result)) return [];

      const tokens = await Promise.all(
        response.data.result
          .filter((t) => t.tokenQuantity !== '0')
          .slice(0, 50)
          .map(async (t): Promise<TokenBalance | null> => {
            try {
              const decimals = parseInt(t.tokenDecimal, 10);
              const rawBig = BigInt(t.tokenQuantity);
              const balance = formatUnits(rawBig, decimals);
              const price = await priceService.getPrice(t.symbol);
              const valueUsd = price ? (parseFloat(balance) * price).toFixed(2) : null;
              return {
                address: t.contractAddress.toLowerCase(),
                symbol: t.symbol,
                name: t.tokenName,
                decimals,
                balance,
                balance_raw: t.tokenQuantity,
                price_usd: price ? price.toFixed(2) : null,
                value_usd: valueUsd,
              };
            } catch {
              return null;
            }
          })
      );

      return tokens
        .filter((t): t is TokenBalance => t !== null)
        .sort((a, b) => parseFloat(b.value_usd ?? '0') - parseFloat(a.value_usd ?? '0'));
    } catch (err) {
      console.warn('BSCScan token list failed:', err);
      return [];
    }
  }

  private async getTokenBalancesAlchemy(address: string, alchemyUrl?: string): Promise<TokenBalance[]> {
    const url = alchemyUrl ?? `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    try {
      const response = await axios.post(
        url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenBalances',
          params: [address],
        },
        { timeout: 10000 }
      );

      const raw: Array<{ contractAddress: string; tokenBalance: string }> =
        response.data?.result?.tokenBalances ?? [];

      // Filter out zero balances
      const nonZero = raw.filter(
        (t) => t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000'
      );

      if (nonZero.length === 0) return [];

      // Fetch metadata for all tokens in parallel (batched)
      const withMeta = await Promise.all(
        nonZero.slice(0, 50).map((t) => this.enrichToken(t.contractAddress, t.tokenBalance, url))
      );

      return withMeta
        .filter((t): t is TokenBalance => t !== null)
        .sort((a, b) => {
          const va = parseFloat(a.value_usd ?? '0');
          const vb = parseFloat(b.value_usd ?? '0');
          return vb - va;
        });
    } catch (err) {
      console.warn('Alchemy token balances failed:', err);
      return [];
    }
  }

  private async enrichToken(contractAddress: string, rawBalance: string, alchemyUrl?: string): Promise<TokenBalance | null> {
    const url = alchemyUrl ?? `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
    try {
      const metaResponse = await axios.post(
        url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenMetadata',
          params: [contractAddress],
        },
        { timeout: 5000 }
      );

      const meta = metaResponse.data?.result;
      if (!meta?.symbol || !meta?.decimals) return null;

      const decimals = Number(meta.decimals);
      const balanceBig = BigInt(rawBalance);
      const balance = formatUnits(balanceBig, decimals);
      const price = await priceService.getPrice(meta.symbol);
      const valueUsd = price ? (parseFloat(balance) * price).toFixed(2) : null;

      return {
        address: contractAddress.toLowerCase(),
        symbol: meta.symbol,
        name: meta.name ?? meta.symbol,
        decimals,
        balance,
        balance_raw: balanceBig.toString(),
        price_usd: price ? price.toFixed(2) : null,
        value_usd: valueUsd,
        logo: meta.logo ?? undefined,
      };
    } catch {
      return null;
    }
  }
}

export const portfolioService = new PortfolioService();
