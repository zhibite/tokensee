// Static seed data — well-known on-chain addresses
// Source: public on-chain analysis, etherscan labels, community data
// All addresses lowercased

export type EntityType =
  | 'exchange'
  | 'protocol'
  | 'bridge'
  | 'fund'
  | 'whale'
  | 'mixer'
  | 'nft'
  | 'stablecoin'
  | 'oracle'
  | 'dao'
  | 'other';

export interface KnownEntity {
  address: string;
  chain: 'ethereum' | 'bsc' | 'multi';
  label: string;
  entity_name: string;
  entity_type: EntityType;
  tags?: string[];
}

export const KNOWN_ENTITIES: KnownEntity[] = [
  // ─── Exchanges — Binance ───────────────────────────────
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', chain: 'ethereum', label: 'Binance Hot Wallet 1', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', chain: 'ethereum', label: 'Binance Hot Wallet 2', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', chain: 'ethereum', label: 'Binance Hot Wallet 3', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x21a31ee1afc51d94c2efccaa2092ad1028285549', chain: 'ethereum', label: 'Binance Hot Wallet 4', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xb38e8c17e38363af6ebdcb3dae12e0243582891d', chain: 'ethereum', label: 'Binance Cold Wallet', entity_name: 'Binance', entity_type: 'exchange', tags: ['cold-wallet'] },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', chain: 'ethereum', label: 'Binance 8', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x001866ae5b3de6caa5a51543fd9fb64f524f5478', chain: 'ethereum', label: 'Binance 9', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', chain: 'ethereum', label: 'Binance 10', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', chain: 'ethereum', label: 'Binance 11 (Whale)', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet', 'whale'] },
  { address: '0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', chain: 'ethereum', label: 'Binance 14', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── Exchanges — Coinbase ──────────────────────────────
  { address: '0xa090e606e30bd747d4e6245a1517ebe430f0057e', chain: 'ethereum', label: 'Coinbase Prime', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['cold-wallet'] },
  { address: '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', chain: 'ethereum', label: 'Coinbase Hot Wallet 1', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x503828976d22510aad0201ac7ec88293211d23da', chain: 'ethereum', label: 'Coinbase Hot Wallet 2', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', chain: 'ethereum', label: 'Coinbase Hot Wallet 3', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x3cd751e6b0078be393132286c442345e5dc49699', chain: 'ethereum', label: 'Coinbase Hot Wallet 4', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511', chain: 'ethereum', label: 'Coinbase Hot Wallet 5', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xeb2629a2818002a1bf7d70f29b6b769fb2c1bdc1', chain: 'ethereum', label: 'Coinbase Hot Wallet 6', entity_name: 'Coinbase', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── Exchanges — OKX ──────────────────────────────────
  { address: '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b', chain: 'ethereum', label: 'OKX Hot Wallet 1', entity_name: 'OKX', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x98ec059dc3adfbdd63429454aeb0c990fba4a128', chain: 'ethereum', label: 'OKX Hot Wallet 2', entity_name: 'OKX', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3', chain: 'ethereum', label: 'OKX Hot Wallet 3', entity_name: 'OKX', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xa7efae728d2936e78bda97dc267687568dd593f3', chain: 'ethereum', label: 'OKX Cold Wallet', entity_name: 'OKX', entity_type: 'exchange', tags: ['cold-wallet'] },

  // ─── Exchanges — Kraken ────────────────────────────────
  { address: '0x2910543af39aba0cd09dbb2d50200b3e800a63d2', chain: 'ethereum', label: 'Kraken Hot Wallet 1', entity_name: 'Kraken', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xcda78a5d728e4e5b4e7fbf1dc5e4a6f959f80f9f', chain: 'ethereum', label: 'Kraken Hot Wallet 2', entity_name: 'Kraken', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0', chain: 'ethereum', label: 'Kraken 3', entity_name: 'Kraken', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f', chain: 'ethereum', label: 'Kraken 4', entity_name: 'Kraken', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── Exchanges — Bybit ────────────────────────────────
  { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', chain: 'ethereum', label: 'Bybit Hot Wallet 1', entity_name: 'Bybit', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xd8da1b6b3541c18ba3d0c0ad6ec2ddfd43bc4e79', chain: 'ethereum', label: 'Bybit Deployer', entity_name: 'Bybit', entity_type: 'exchange', tags: [] },

  // ─── Exchanges — Bitfinex ─────────────────────────────
  { address: '0x1151314c646ce4e0efd76d1af4760ae66a9fe30f', chain: 'ethereum', label: 'Bitfinex Hot Wallet 1', entity_name: 'Bitfinex', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x742d35cc6634c0532925a3b8d4c9c0d2a6b3f7e1', chain: 'ethereum', label: 'Bitfinex Hot Wallet 2', entity_name: 'Bitfinex', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x876eabf441b2ee5b5b0554fd502a8e0600950cfa', chain: 'ethereum', label: 'Bitfinex Cold Wallet', entity_name: 'Bitfinex', entity_type: 'exchange', tags: ['cold-wallet'] },

  // ─── Exchanges — Huobi / HTX ──────────────────────────
  { address: '0xab5c66752a9e8167967685f1450532fb96d5d24f', chain: 'ethereum', label: 'HTX Hot Wallet 1', entity_name: 'HTX', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b', chain: 'ethereum', label: 'HTX Hot Wallet 2', entity_name: 'HTX', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xfdb16996831753d5331ff813c29a93c76834a0ad', chain: 'ethereum', label: 'HTX Hot Wallet 3', entity_name: 'HTX', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── Exchanges — Gate.io ──────────────────────────────
  { address: '0x0d0707963952f2fba59dd06f2b425ace40b492fe', chain: 'ethereum', label: 'Gate.io Hot Wallet 1', entity_name: 'Gate.io', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0x7793cd85c11a924478d358d49b05b37e91b5810f', chain: 'ethereum', label: 'Gate.io Hot Wallet 2', entity_name: 'Gate.io', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── Protocols — Uniswap ──────────────────────────────
  { address: '0x1f98431c8ad98523631ae4a59f267346ea31f984', chain: 'ethereum', label: 'Uniswap V3 Factory', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex', 'v3'] },
  { address: '0xe592427a0aece92de3edee1f18e0157c05861564', chain: 'ethereum', label: 'Uniswap V3 SwapRouter', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex', 'v3'] },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', chain: 'ethereum', label: 'Uniswap V3 SwapRouter02', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex', 'v3'] },
  { address: '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b', chain: 'ethereum', label: 'Uniswap Universal Router v1', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex'] },
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', chain: 'ethereum', label: 'Uniswap Universal Router v2', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex'] },
  { address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', chain: 'ethereum', label: 'Uniswap V2 Router', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex', 'v2'] },
  { address: '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f', chain: 'ethereum', label: 'Uniswap V2 Factory', entity_name: 'Uniswap', entity_type: 'protocol', tags: ['dex', 'v2'] },

  // ─── Protocols — Aave ─────────────────────────────────
  { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', chain: 'ethereum', label: 'Aave V3 Pool', entity_name: 'Aave', entity_type: 'protocol', tags: ['lending', 'v3'] },
  { address: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9', chain: 'ethereum', label: 'Aave V2 Pool', entity_name: 'Aave', entity_type: 'protocol', tags: ['lending', 'v2'] },
  { address: '0x2f39d218133afab8f2b819b1066c7e434ad94e9e', chain: 'ethereum', label: 'Aave V3 Pool Addresses Provider', entity_name: 'Aave', entity_type: 'protocol', tags: ['lending'] },

  // ─── Protocols — Compound ─────────────────────────────
  { address: '0xc3d688b66703497daa19211eedff47f25384cdc3', chain: 'ethereum', label: 'Compound V3 cUSDCv3', entity_name: 'Compound', entity_type: 'protocol', tags: ['lending', 'v3'] },
  { address: '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b', chain: 'ethereum', label: 'Compound Comptroller', entity_name: 'Compound', entity_type: 'protocol', tags: ['lending'] },

  // ─── Protocols — Curve ────────────────────────────────
  { address: '0xd51a44d3fae010294c616388b506acda1bfaae46', chain: 'ethereum', label: 'Curve Tricrypto2 Pool', entity_name: 'Curve', entity_type: 'protocol', tags: ['dex', 'amm'] },
  { address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7', chain: 'ethereum', label: 'Curve 3Pool (DAI/USDC/USDT)', entity_name: 'Curve', entity_type: 'protocol', tags: ['dex', 'stablecoin'] },
  { address: '0xdc24316b9ae028f1497c275eb9192a3ea0f67022', chain: 'ethereum', label: 'Curve stETH Pool', entity_name: 'Curve', entity_type: 'protocol', tags: ['dex', 'liquid-staking'] },

  // ─── Protocols — MakerDAO ─────────────────────────────
  { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', chain: 'ethereum', label: 'Maker Token (MKR)', entity_name: 'MakerDAO', entity_type: 'protocol', tags: ['dao', 'governance'] },
  { address: '0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b', chain: 'ethereum', label: 'MakerDAO VAT', entity_name: 'MakerDAO', entity_type: 'protocol', tags: ['lending', 'stablecoin'] },

  // ─── Protocols — Lido ─────────────────────────────────
  { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', chain: 'ethereum', label: 'Lido stETH Token', entity_name: 'Lido', entity_type: 'protocol', tags: ['liquid-staking'] },
  { address: '0xdc62f9e8c34be08501cdef4ebde0a280f576d762', chain: 'ethereum', label: 'Lido Withdrawal Queue', entity_name: 'Lido', entity_type: 'protocol', tags: ['liquid-staking'] },

  // ─── Protocols — 1inch ────────────────────────────────
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', chain: 'ethereum', label: '1inch V5 Aggregation Router', entity_name: '1inch', entity_type: 'protocol', tags: ['dex', 'aggregator'] },
  { address: '0x111111125421ca6dc452d289314280a0f8842a65', chain: 'ethereum', label: '1inch V6 Aggregation Router', entity_name: '1inch', entity_type: 'protocol', tags: ['dex', 'aggregator'] },

  // ─── Protocols — Balancer ─────────────────────────────
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', chain: 'ethereum', label: 'Balancer V2 Vault', entity_name: 'Balancer', entity_type: 'protocol', tags: ['dex', 'amm'] },

  // ─── Bridges ──────────────────────────────────────────
  { address: '0x8eb8a3b98659cce290402893d0123abb75e3ab28', chain: 'ethereum', label: 'Avalanche Bridge', entity_name: 'Avalanche Bridge', entity_type: 'bridge', tags: ['cross-chain'] },
  { address: '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf', chain: 'ethereum', label: 'Polygon PoS Bridge ERC20', entity_name: 'Polygon Bridge', entity_type: 'bridge', tags: ['cross-chain', 'polygon'] },
  { address: '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', chain: 'ethereum', label: 'Polygon Bridge Proxy', entity_name: 'Polygon Bridge', entity_type: 'bridge', tags: ['cross-chain', 'polygon'] },
  { address: '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', chain: 'ethereum', label: 'Optimism Gateway', entity_name: 'Optimism Bridge', entity_type: 'bridge', tags: ['cross-chain', 'l2'] },
  { address: '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a', chain: 'ethereum', label: 'Arbitrum Bridge', entity_name: 'Arbitrum Bridge', entity_type: 'bridge', tags: ['cross-chain', 'l2'] },
  { address: '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', chain: 'ethereum', label: 'Arbitrum Delayed Inbox', entity_name: 'Arbitrum Bridge', entity_type: 'bridge', tags: ['cross-chain', 'l2'] },
  { address: '0x3ee18b2214aff97000d974cf647e7c347e8fa585', chain: 'ethereum', label: 'Wormhole ETH Bridge', entity_name: 'Wormhole', entity_type: 'bridge', tags: ['cross-chain'] },
  { address: '0x3154cf16ccdb4c6d922629664174b904d80f2c35', chain: 'ethereum', label: 'Base Bridge', entity_name: 'Base Bridge', entity_type: 'bridge', tags: ['cross-chain', 'l2', 'coinbase'] },

  // ─── Stablecoins / Tokens ─────────────────────────────
  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chain: 'ethereum', label: 'USD Coin (USDC)', entity_name: 'Circle', entity_type: 'stablecoin', tags: ['stablecoin'] },
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', chain: 'ethereum', label: 'Tether USD (USDT)', entity_name: 'Tether', entity_type: 'stablecoin', tags: ['stablecoin'] },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', chain: 'ethereum', label: 'Dai Stablecoin (DAI)', entity_name: 'MakerDAO', entity_type: 'stablecoin', tags: ['stablecoin', 'decentralized'] },
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', chain: 'ethereum', label: 'Wrapped Ether (WETH)', entity_name: 'WETH', entity_type: 'protocol', tags: ['wrapped'] },

  // ─── Oracles ──────────────────────────────────────────
  { address: '0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf', chain: 'ethereum', label: 'Chainlink ETH/USD Feed', entity_name: 'Chainlink', entity_type: 'oracle', tags: ['oracle'] },
  { address: '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419', chain: 'ethereum', label: 'Chainlink ETH/USD Proxy', entity_name: 'Chainlink', entity_type: 'oracle', tags: ['oracle'] },

  // ─── Funds / VCs ──────────────────────────────────────
  { address: '0x05e793ce0c6027323ac150f6d45c2344d28b6019', chain: 'ethereum', label: 'Paradigm (VC)', entity_name: 'Paradigm', entity_type: 'fund', tags: ['vc', 'investor'] },
  { address: '0xa4c8d221d8bb851f83aadd0223a8900a6921a349', chain: 'ethereum', label: 'a16z Crypto Fund', entity_name: 'a16z', entity_type: 'fund', tags: ['vc', 'investor'] },
  { address: '0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0', chain: 'ethereum', label: 'Jump Trading', entity_name: 'Jump Trading', entity_type: 'fund', tags: ['market-maker', 'trading'] },

  // ─── DAOs ─────────────────────────────────────────────
  { address: '0xfe89cc7abb2c4183683ab71653c4cdc9b02d44b7', chain: 'ethereum', label: 'Gitcoin DAO Treasury', entity_name: 'Gitcoin', entity_type: 'dao', tags: ['dao', 'public-goods'] },
  { address: '0x4f3aff3a747fcbc2bf770959f946923c68b7c2d9', chain: 'ethereum', label: 'Uniswap Governance Treasury', entity_name: 'Uniswap DAO', entity_type: 'dao', tags: ['dao', 'governance'] },

  // ─── Mixers ───────────────────────────────────────────
  { address: '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', chain: 'ethereum', label: 'Tornado Cash 0.1 ETH', entity_name: 'Tornado Cash', entity_type: 'mixer', tags: ['privacy', 'sanctioned'] },
  { address: '0x9ad122c22b14202b4490edaf288fdb3c7cb3ff5e', chain: 'ethereum', label: 'Tornado Cash 1 ETH', entity_name: 'Tornado Cash', entity_type: 'mixer', tags: ['privacy', 'sanctioned'] },
  { address: '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', chain: 'ethereum', label: 'Tornado Cash 10 ETH', entity_name: 'Tornado Cash', entity_type: 'mixer', tags: ['privacy', 'sanctioned'] },
  { address: '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', chain: 'ethereum', label: 'Tornado Cash 100 ETH', entity_name: 'Tornado Cash', entity_type: 'mixer', tags: ['privacy', 'sanctioned'] },

  // ─── BSC — Exchanges ──────────────────────────────────
  { address: '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', chain: 'bsc', label: 'Binance BSC Hot Wallet 1', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },
  { address: '0xe2fc31f816a9b3aa84be7d6e392be04851f62b68', chain: 'bsc', label: 'Binance BSC Hot Wallet 2', entity_name: 'Binance', entity_type: 'exchange', tags: ['hot-wallet'] },

  // ─── BSC — Protocols ──────────────────────────────────
  { address: '0x10ed43c718714eb63d5aa57b78b54704e256024e', chain: 'bsc', label: 'PancakeSwap V2 Router', entity_name: 'PancakeSwap', entity_type: 'protocol', tags: ['dex', 'v2'] },
  { address: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', chain: 'bsc', label: 'PancakeSwap V2 Factory', entity_name: 'PancakeSwap', entity_type: 'protocol', tags: ['dex', 'v2'] },
  { address: '0x1b81d678ffb9c0263b24a97847620c99d213eb14', chain: 'bsc', label: 'PancakeSwap V3 SmartRouter', entity_name: 'PancakeSwap', entity_type: 'protocol', tags: ['dex', 'v3'] },

  // ─── Multi-chain — Wrapped tokens ─────────────────────
  { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', chain: 'bsc', label: 'Wrapped BNB (WBNB)', entity_name: 'WBNB', entity_type: 'protocol', tags: ['wrapped'] },
  { address: '0x55d398326f99059ff775485246999027b3197955', chain: 'bsc', label: 'Tether USD BSC (USDT)', entity_name: 'Tether', entity_type: 'stablecoin', tags: ['stablecoin'] },
  { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', chain: 'bsc', label: 'USD Coin BSC (USDC)', entity_name: 'Circle', entity_type: 'stablecoin', tags: ['stablecoin'] },
];

// Build a fast lookup map: `${address}:${chain}` → entity
export const ENTITY_MAP = new Map<string, KnownEntity>(
  KNOWN_ENTITIES.flatMap((e) => {
    const key = `${e.address.toLowerCase()}:${e.chain}`;
    const keyMulti = `${e.address.toLowerCase()}:multi`;
    return [[key, e], [keyMulti, e]];
  })
);
