import axios from 'axios';
import { CacheService, CACHE_KEYS, TTL } from '../cache/CacheService.js';
import { env } from '../../config/index.js';

const cache = new CacheService();

// Symbol → CoinGecko ID mapping for common tokens
const COINGECKO_ID_MAP: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  BNB: 'binancecoin',
  WBNB: 'binancecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MATIC: 'matic-network',
  ARB: 'arbitrum',
  OP: 'optimism',
};

export class PriceService {
  async getPrice(symbol: string): Promise<number | null> {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = CACHE_KEYS.tokenPrice(upperSymbol);
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const price = await this.fetchFromCoinGecko(upperSymbol);
    if (price !== null) {
      await cache.set(cacheKey, price, TTL.TOKEN_PRICE);
    }
    return price;
  }

  async getPriceUSD(symbol: string, amount: string): Promise<string | null> {
    const price = await this.getPrice(symbol);
    if (price === null) return null;
    const value = parseFloat(amount) * price;
    return isNaN(value) ? null : value.toFixed(2);
  }

  /**
   * Returns the USD price of a token at a specific Unix timestamp.
   * Uses CoinGecko's /coins/{id}/history endpoint (daily granularity).
   * Results are cached permanently since historical prices never change.
   */
  async getPriceAt(symbol: string, timestamp: number): Promise<number | null> {
    const upperSymbol = symbol.toUpperCase();
    const id = COINGECKO_ID_MAP[upperSymbol];
    if (!id) return null;

    // CoinGecko uses dd-mm-yyyy date format
    const date = new Date(timestamp * 1000);
    const day   = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year  = date.getUTCFullYear();
    const dateStr = `${day}-${month}-${year}`;

    const cacheKey = `hist-price:${id}:${dateStr}`;
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    try {
      const params: Record<string, string> = { date: dateStr, localization: 'false' };
      if (env.COINGECKO_API_KEY) params['x_cg_demo_api_key'] = env.COINGECKO_API_KEY;

      const response = await axios.get<{
        market_data?: { current_price?: { usd?: number } };
      }>(`https://api.coingecko.com/api/v3/coins/${id}/history`, {
        params,
        timeout: 8_000,
      });

      const price = response.data?.market_data?.current_price?.usd ?? null;
      if (price !== null) {
        // Historical prices are immutable — cache forever (24h TTL is enough)
        await cache.set(cacheKey, price, TTL.TOKEN_METADATA);
      }
      return price;
    } catch {
      return null;
    }
  }

  private async fetchFromCoinGecko(symbol: string): Promise<number | null> {
    const id = COINGECKO_ID_MAP[symbol];
    if (!id) return null;

    try {
      const params: Record<string, string> = {
        ids: id,
        vs_currencies: 'usd',
      };
      if (env.COINGECKO_API_KEY) {
        params['x_cg_demo_api_key'] = env.COINGECKO_API_KEY;
      }

      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params,
        timeout: 5000,
      });

      return response.data[id]?.usd ?? null;
    } catch {
      return null;
    }
  }
}

export const priceService = new PriceService();
