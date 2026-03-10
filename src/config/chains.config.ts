import type { ChainConfig } from '../types/chain.types.js';

export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
export const WETH_ADDRESS_ETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
export const WBNB_ADDRESS_BSC = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
export const WETH_ADDRESS_ARB = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
export const WMATIC_ADDRESS_POLYGON = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270';
export const WETH_ADDRESS_BASE = '0x4200000000000000000000000000000000000006';
export const WETH_ADDRESS_OP   = '0x4200000000000000000000000000000000000006'; // same as Base (OP Stack)
export const WAVAX_ADDRESS     = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

// Event topic signatures (keccak256 of event signature)
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const UNISWAP_V3_SWAP_TOPIC =
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
export const UNISWAP_V2_SWAP_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'ethereum',
    displayName: 'Ethereum',
    nativeCurrency: {
      symbol: 'ETH',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [], // populated at runtime from env
    explorerUrl: 'https://etherscan.io',
    blockTime: 12,
  },
  bsc: {
    chainId: 56,
    name: 'bsc',
    displayName: 'BNB Smart Chain',
    nativeCurrency: {
      symbol: 'BNB',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://bscscan.com',
    blockTime: 3,
  },
  arbitrum: {
    chainId: 42161,
    name: 'arbitrum',
    displayName: 'Arbitrum One',
    nativeCurrency: {
      symbol: 'ETH',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://arbiscan.io',
    blockTime: 1,
  },
  polygon: {
    chainId: 137,
    name: 'polygon',
    displayName: 'Polygon',
    nativeCurrency: {
      symbol: 'MATIC',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://polygonscan.com',
    blockTime: 2,
  },
  base: {
    chainId: 8453,
    name: 'base',
    displayName: 'Base',
    nativeCurrency: {
      symbol: 'ETH',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://basescan.org',
    blockTime: 2,
  },
  optimism: {
    chainId: 10,
    name: 'optimism',
    displayName: 'Optimism',
    nativeCurrency: {
      symbol: 'ETH',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://optimistic.etherscan.io',
    blockTime: 2,
  },
  avalanche: {
    chainId: 43114,
    name: 'avalanche',
    displayName: 'Avalanche C-Chain',
    nativeCurrency: {
      symbol: 'AVAX',
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
    },
    rpcUrls: [],
    explorerUrl: 'https://snowtrace.io',
    blockTime: 2,
  },
};
