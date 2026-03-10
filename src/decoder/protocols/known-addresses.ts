// address (lowercase) → protocol ID
export const KNOWN_ADDRESSES: Record<string, Record<string, string>> = {
  ethereum: {
    // Uniswap V3
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'uniswap-v3', // SwapRouter
    // EigenLayer
    '0x858646372cc42e1a627be943c68632c6a12e0de': 'eigenlayer',  // StrategyManager
    '0x39053d51b77dc0d36036fc1fcc8cb819df8ef37b': 'eigenlayer', // DelegationManager
    '0x91e677b07f7af907ec9a428aafa9fc14a0d3a338': 'eigenlayer', // EigenPodManager
    // Pendle Finance (Ethereum)
    '0x888888888889758f76e7103c6cbf23abbf58f946': 'pendle', // Router v4
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'uniswap-v3', // SwapRouter02
    '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b': 'uniswap-universal', // UniversalRouter v1
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'uniswap-universal', // UniversalRouter v2
    // Uniswap V2
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'uniswap-v2', // V2 Router02
    // Aave V3
    '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'aave-v3', // Pool
    '0x2f39d218133afab8f2b819b1066c7e434ad94e9e': 'aave-v3', // PoolAddressesProvider
    // Curve — major pools + routers
    '0xbebc44055f9412214ced52d47bd11b68d6abcac6': 'curve',   // 3pool (DAI/USDC/USDT)
    '0xdc24316b9ae028f1497c275eb9192a3ea0f67022': 'curve',   // stETH/ETH
    '0xa5407eae9ba41422680e2e00537571bcc53efbfd': 'curve',   // sUSD
    '0xd51a44d3fae010294c616388b506acda1bfaae46': 'curve',   // Tricrypto2
    '0x99a58482bd75cbab83b27ec03ca68ff489b5788f': 'curve',   // Router
    '0xf0d4c12a5768d806021f80a262b4d39d26c58b8d': 'curve',   // Router (new)
    // Compound V3 (Comet)
    '0xc3d688b66703497daa19211eedff47f25384cdc3': 'compound-v3', // cUSDCv3
    '0xa17581a9e3356d9a858b789d68b4d866e593ae94': 'compound-v3', // cWETHv3
  },
  bsc: {
    // PancakeSwap V2 (same ABI as Uniswap V2)
    '0x10ed43c718714eb63d5aa57b78b54704e256024e': 'pancakeswap-v2', // Router
    '0x05ff2b0db69458a0750badebc4f9e13add608c7f': 'pancakeswap-v2', // Router (old)
    // PancakeSwap V3
    '0x1b81d678ffb9c0263b24a97847620c99d213eb14': 'pancakeswap-v3', // SmartRouter
  },
  arbitrum: {
    // Uniswap V3
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'uniswap-v3', // SwapRouter
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'uniswap-v3', // SwapRouter02
    '0x5e325eda8064b456f4781070c0738d849c824258': 'uniswap-universal', // UniversalRouter v1.2
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'uniswap-universal', // UniversalRouter v2
    // Uniswap V2 (Arbitrum)
    '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24': 'uniswap-v2', // V2 Router
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'aave-v3', // Pool
    // GMX v1
    '0xb87a436b93ffe9d75c5cfa7bacfff96430b09868': 'gmx', // PositionRouter v1
    '0x3d6ba331e3d9702c5e8a8d254e5d8a285f223aba': 'gmx', // GlpManager
    '0xabbbc5f99639c9b6bcb58544ddf04efa6802f4064': 'gmx', // Router
    // GMX v2 (Synthetics)
    '0x7c68c7866a64fa2160f78eeae12217ffbf871fa8': 'gmx', // ExchangeRouter v2
    // Pendle Finance
    '0x888888888889758f76e7103c6cbf23abbf58f946': 'pendle', // Router v4
    '0x00000000005bbb0ef59571e58418f9a4357b68a0': 'pendle', // Router v3
  },
  polygon: {
    // Uniswap V3
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'uniswap-v3', // SwapRouter
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'uniswap-v3', // SwapRouter02
    '0xec7be89e362d1d8f89ef6db66a98e35c4bab9729': 'uniswap-universal', // UniversalRouter
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'uniswap-universal', // UniversalRouter v2
    // Uniswap V2 (Polygon)
    '0xedf6066a2b290c185783862c7f4776a2c8077ad1': 'uniswap-v2',
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'aave-v3', // Pool
    // QuickSwap (Uniswap V2 fork)
    '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff': 'quickswap-v2',
  },
  optimism: {
    // Uniswap V3
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'uniswap-v3', // SwapRouter
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'uniswap-v3', // SwapRouter02
    '0xec7be89e362d1d8f89ef6db66a98e35c4bab9729': 'uniswap-universal', // UniversalRouter
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'uniswap-universal', // UniversalRouter v2
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'aave-v3', // Pool
    // Velodrome (major OP DEX, Uniswap V2 fork)
    '0xa132dab612db5cb9fc9ac426a0cc215a3423f9c9': 'uniswap-v2',
  },
  avalanche: {
    // Trader Joe (major Avalanche DEX, Uniswap V2 fork)
    '0x60ae616a2155ee3d9a68541ba4544862310933d4': 'uniswap-v2', // JoeRouter v2
    '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30': 'uniswap-v2', // JoeRouter v2.1
    // Pangolin (Uniswap V2 fork)
    '0xe54ca86531e17ef3616d22ca28b0d458b6c89106': 'uniswap-v2', // Pangolin Router
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'aave-v3', // Pool
    // GMX v1 on Avalanche
    '0x5f719c2f1095f7b9fc68a68e35b51194f4b6abe8': 'gmx', // PositionRouter
    '0xd6df932a45c0f255f85145f286ea0b292b21c90b': 'gmx', // Router
  },
  base: {
    // Uniswap V3
    '0x2626664c2603336e57b271c5c0b26f421741e481': 'uniswap-v3', // SwapRouter02
    '0x198ef1ec325a96cc354c7266a038be8b5c558f67': 'uniswap-universal', // UniversalRouter
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'uniswap-universal', // UniversalRouter v2
    // Uniswap V2 (Base)
    '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24': 'uniswap-v2',
    // Aave V3
    '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': 'aave-v3', // Pool
    // Aerodrome (Velodrome fork, major Base DEX)
    '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': 'aerodrome',
  },
};

// ERC-20 Transfer event signature
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Uniswap V3 Swap event signature
export const UNISWAP_V3_SWAP_TOPIC =
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

// Uniswap V2 / PancakeSwap V2 Swap event signature
export const UNISWAP_V2_SWAP_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
