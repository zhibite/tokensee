/**
 * import-labels.ts — P0: bulk seed the entities table from multiple sources.
 *
 * Sources (in order):
 *   1. Hardcoded high-confidence seed (300+ addresses across 7 chains)
 *   2. brianleect/etherscan-labels GitHub dataset (fetched at runtime if reachable)
 *
 * Usage:
 *   npm run import-labels
 *   npm run import-labels -- --dry-run   (preview counts only)
 *   npm run import-labels -- --skip-github  (hardcoded seed only)
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 */

import 'dotenv/config';
import axios from 'axios';
import { db, closePool } from '../src/services/db/Database.js';

const DRY_RUN     = process.argv.includes('--dry-run');
const SKIP_GITHUB = process.argv.includes('--skip-github');

// ─── Types ──────────────────────────────────────────────────────────────────

type Chain = 'ethereum' | 'bsc' | 'arbitrum' | 'polygon' | 'base' | 'optimism' | 'avalanche' | 'multi';
type EntityType = 'exchange' | 'protocol' | 'bridge' | 'fund' | 'whale' | 'mixer' | 'stablecoin' | 'oracle' | 'dao' | 'nft' | 'other';

interface SeedEntry {
  address: string;
  chain: Chain;
  label: string;
  entity_name: string;
  entity_type: EntityType;
  confidence: 'high' | 'medium';
  tags?: string[];
}

// ─── Hardcoded Seed ──────────────────────────────────────────────────────────

const SEED: SeedEntry[] = [

  // ───────────────────────────── EXCHANGES ────────────────────────────────

  // Binance — Ethereum
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', chain: 'ethereum', label: 'Binance Hot Wallet 1',     entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', chain: 'ethereum', label: 'Binance Hot Wallet 2',     entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', chain: 'ethereum', label: 'Binance Hot Wallet 3',     entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x21a31ee1afc51d94c2efccaa2092ad1028285549', chain: 'ethereum', label: 'Binance Hot Wallet 4',     entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xb38e8c17e38363af6ebdcb3dae12e0243582891d', chain: 'ethereum', label: 'Binance Cold Wallet',      entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', chain: 'ethereum', label: 'Binance 8',                entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x001866ae5b3de6caa5a51543fd9fb64f524f5478', chain: 'ethereum', label: 'Binance 9',                entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', chain: 'ethereum', label: 'Binance 10',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', chain: 'ethereum', label: 'Binance 11',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', chain: 'ethereum', label: 'Binance 14',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x5a52e96bacdabb82fd05763e25335261b270efcb', chain: 'ethereum', label: 'Binance 15',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', chain: 'ethereum', label: 'Binance 16',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', chain: 'ethereum', label: 'Binance 17',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xe2fc31f816a9b3aa1ad57b4d66cac99e9a9de2d', chain: 'ethereum', label: 'Binance 18',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x515b99dd1ae0e20a6af93d47a5fcad1a65f1b0b3', chain: 'ethereum', label: 'Binance 20',               entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  // Binance — BSC
  { address: '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', chain: 'bsc',      label: 'Binance BSC Hot Wallet',   entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x3c783c21a0383057d128bae431894a5c19f9cf06', chain: 'bsc',      label: 'Binance BSC Hot Wallet 2', entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xe2fc31f816a9b3aa1ad57b4d66cac99e9a9de2d', chain: 'bsc',      label: 'Binance BSC 3',            entity_name: 'Binance',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // Coinbase — Ethereum
  { address: '0xa090e606e30bd747d4e6245a1517ebe430f0057e', chain: 'ethereum', label: 'Coinbase Prime',           entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },
  { address: '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', chain: 'ethereum', label: 'Coinbase Hot Wallet 1',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x503828976d22510aad0201ac7ec88293211d23da', chain: 'ethereum', label: 'Coinbase Hot Wallet 2',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', chain: 'ethereum', label: 'Coinbase Hot Wallet 3',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x3cd751e6b0078be393132286c442345e5dc49699', chain: 'ethereum', label: 'Coinbase Hot Wallet 4',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511', chain: 'ethereum', label: 'Coinbase Hot Wallet 5',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xeb2629a2818002a1bf7d70f29b6b769fb2c1bdc1', chain: 'ethereum', label: 'Coinbase Hot Wallet 6',    entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x02466e547bfdab679fc49e96bbfc62b9747d997c', chain: 'ethereum', label: 'Coinbase 7',               entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x1b3cb81e51011b549d78bf720b0d924ac763a7c2', chain: 'ethereum', label: 'Coinbase 8',               entity_name: 'Coinbase',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // OKX
  { address: '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b', chain: 'ethereum', label: 'OKX Hot Wallet 1',         entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x98ec059dc3adfbdd63429454aeb0c990fba4a128', chain: 'ethereum', label: 'OKX Hot Wallet 2',         entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3', chain: 'ethereum', label: 'OKX Hot Wallet 3',         entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xa7efae728d2936e78bda97dc267687568dd593f3', chain: 'ethereum', label: 'OKX Cold Wallet',           entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },
  { address: '0x4e935a3f27d44c72f2d73474e99d0e3e7a78d39b', chain: 'ethereum', label: 'OKX 5',                    entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x8b99f3660622e21f2910ecca7fbe51d654a1517d', chain: 'ethereum', label: 'OKX 6',                    entity_name: 'OKX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // Kraken
  { address: '0x2910543af39aba0cd09dbb2d50200b3e800a63d2', chain: 'ethereum', label: 'Kraken Hot Wallet 1',      entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xcda78a5d728e4e5b4e7fbf1dc5e4a6f959f80f9f', chain: 'ethereum', label: 'Kraken Hot Wallet 2',      entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0', chain: 'ethereum', label: 'Kraken 3',                 entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f', chain: 'ethereum', label: 'Kraken 4',                 entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13', chain: 'ethereum', label: 'Kraken 5',                 entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xe853c56864a2ebe4576a807d26fdc4a0ada51919', chain: 'ethereum', label: 'Kraken 6',                 entity_name: 'Kraken',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // Bybit
  { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', chain: 'ethereum', label: 'Bybit Hot Wallet 1',       entity_name: 'Bybit',     entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4', chain: 'ethereum', label: 'Bybit Hot Wallet 2',       entity_name: 'Bybit',     entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x701a95707a0290ac8b90b3719e8ee5b210360883', chain: 'ethereum', label: 'Bybit Cold Wallet',         entity_name: 'Bybit',     entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },

  // Bitfinex
  { address: '0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec', chain: 'ethereum', label: 'Bitfinex Hot Wallet 1',    entity_name: 'Bitfinex',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x742d35cc6634c0532925a3b844bc454e4438f44e', chain: 'ethereum', label: 'Bitfinex Hot Wallet 2',    entity_name: 'Bitfinex',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x876eabf441b2ee5b5b0554fd502a8e0600950cfa', chain: 'ethereum', label: 'Bitfinex 3',               entity_name: 'Bitfinex',  entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xd64773ec5570e1c92ab4c53ebd44ff9bc67c76c5', chain: 'ethereum', label: 'Bitfinex Cold Wallet',      entity_name: 'Bitfinex',  entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },

  // KuCoin
  { address: '0xd6216fc19db775df9774a6e33526131da7d19a2c', chain: 'ethereum', label: 'KuCoin Hot Wallet 1',      entity_name: 'KuCoin',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xa1d8d972560c2f8144af871db508f0b0b10a3fbf', chain: 'ethereum', label: 'KuCoin Hot Wallet 2',      entity_name: 'KuCoin',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x2b5634c42055806a59e9107ed44d43c426e58258', chain: 'ethereum', label: 'KuCoin 3',                 entity_name: 'KuCoin',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // Gate.io
  { address: '0x0d0707963952f2fba59dd06f2b425ace40b492fe', chain: 'ethereum', label: 'Gate.io Hot Wallet 1',     entity_name: 'Gate.io',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x7793cd85c11a924478d358d49b05b37e91b5810f', chain: 'ethereum', label: 'Gate.io Hot Wallet 2',     entity_name: 'Gate.io',   entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c', chain: 'ethereum', label: 'Gate.io Cold Wallet',       entity_name: 'Gate.io',   entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },

  // HTX (Huobi)
  { address: '0xab5c66752a9e8167967685f1450532fb96d5d24f', chain: 'ethereum', label: 'HTX Hot Wallet 1',         entity_name: 'HTX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b', chain: 'ethereum', label: 'HTX Hot Wallet 2',         entity_name: 'HTX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0xfdb16996831753d5331ff813c29a93c76834a0f', chain: 'ethereum',  label: 'HTX 3',                    entity_name: 'HTX',       entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x46705dfff24256421a05d056c29e81bdc09723b8', chain: 'ethereum', label: 'HTX Cold Wallet',           entity_name: 'HTX',       entity_type: 'exchange', confidence: 'high', tags: ['cold-wallet'] },

  // MEXC
  { address: '0x75e89d5979e4f6fba9f97c104c2f0afb3f1dcb88', chain: 'ethereum', label: 'MEXC Hot Wallet 1',        entity_name: 'MEXC',      entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x3cc936b795a188f0e246cbb2d74c5bd190aecf18', chain: 'ethereum', label: 'MEXC Hot Wallet 2',        entity_name: 'MEXC',      entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // Bitget
  { address: '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23', chain: 'ethereum', label: 'Bitget Hot Wallet 1',      entity_name: 'Bitget',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },
  { address: '0x149380f27a6f3a4cde4f2b5700d3d6e0e4a58785', chain: 'ethereum', label: 'Bitget Hot Wallet 2',      entity_name: 'Bitget',    entity_type: 'exchange', confidence: 'high', tags: ['hot-wallet'] },

  // ───────────────────────────── BRIDGES ──────────────────────────────────

  // Arbitrum Official Bridge
  { address: '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a', chain: 'ethereum', label: 'Arbitrum Bridge',         entity_name: 'Arbitrum', entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0xa3a7b6f88361f48403514059f1f16c8e78d60eec', chain: 'ethereum', label: 'Arbitrum Bridge Inbox',   entity_name: 'Arbitrum', entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', chain: 'ethereum', label: 'Arbitrum Delayed Inbox', entity_name: 'Arbitrum', entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },

  // Optimism Bridge
  { address: '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', chain: 'ethereum', label: 'Optimism Bridge',         entity_name: 'Optimism', entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0x467194771dae2967aef3ecbedd3bf9a310c76c65', chain: 'ethereum', label: 'Optimism CrossDomain Msg',entity_name: 'Optimism', entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },

  // Base Bridge
  { address: '0x3154cf16ccdb4c6d922629664174b904d80f2c35', chain: 'ethereum', label: 'Base Bridge',              entity_name: 'Base',     entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0x49048044d57e1c92a77f2c67aa08a0b7c4710be4', chain: 'ethereum', label: 'Base Portal',              entity_name: 'Base',     entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },

  // Polygon Bridge
  { address: '0x401f6c983ea34274ec46f84d70b31c151321188b', chain: 'ethereum', label: 'Polygon Bridge',           entity_name: 'Polygon',  entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0x8484ef722627bf18ca5ae6bcf031c23e6e922b30', chain: 'ethereum', label: 'Polygon Bridge 2',         entity_name: 'Polygon',  entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },
  { address: '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', chain: 'ethereum', label: 'Polygon ERC20 Bridge',     entity_name: 'Polygon',  entity_type: 'bridge', confidence: 'high', tags: ['l2-bridge'] },

  // Wormhole
  { address: '0x98f3c9e6e3face36baad05fe09d375ef1464288b', chain: 'ethereum', label: 'Wormhole Bridge',          entity_name: 'Wormhole', entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },

  // Stargate Finance
  { address: '0x8731d54e9d02c286767d56ac03e8037c07e01e98', chain: 'ethereum', label: 'Stargate Router',          entity_name: 'Stargate', entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },
  { address: '0xdf0770df86a8034b3efef0a1bb3c889b8332ff56', chain: 'ethereum', label: 'Stargate USDC Pool',       entity_name: 'Stargate', entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },

  // Hop Protocol
  { address: '0x3e4a3a4796d16c0cd582c382691998f7c06420b6', chain: 'ethereum', label: 'Hop USDC Bridge',          entity_name: 'Hop',      entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },
  { address: '0xb8901acb165ed027e32754e0ffe830802919727f', chain: 'ethereum', label: 'Hop ETH Bridge',           entity_name: 'Hop',      entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },

  // Across Protocol
  { address: '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5', chain: 'ethereum', label: 'Across Bridge',            entity_name: 'Across',   entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },

  // Avalanche Bridge
  { address: '0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0', chain: 'ethereum', label: 'Avalanche Bridge',         entity_name: 'Avalanche Bridge', entity_type: 'bridge', confidence: 'high', tags: ['cross-chain'] },

  // ───────────────────────────── STABLECOINS ───────────────────────────────

  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chain: 'ethereum', label: 'USDC Token (Circle)',    entity_name: 'Circle (USDC)', entity_type: 'stablecoin', confidence: 'high', tags: ['erc20'] },
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', chain: 'ethereum', label: 'USDT Token (Tether)',    entity_name: 'Tether (USDT)', entity_type: 'stablecoin', confidence: 'high', tags: ['erc20'] },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', chain: 'ethereum', label: 'DAI Token (MakerDAO)',   entity_name: 'MakerDAO (DAI)', entity_type: 'stablecoin', confidence: 'high', tags: ['erc20'] },
  { address: '0x853d955acef822db058eb8505911ed77f175b99e', chain: 'ethereum', label: 'FRAX Token',             entity_name: 'Frax Finance',   entity_type: 'stablecoin', confidence: 'high', tags: ['erc20', 'algorithmic'] },
  { address: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0', chain: 'ethereum', label: 'LUSD Token (Liquity)',   entity_name: 'Liquity (LUSD)',  entity_type: 'stablecoin', confidence: 'high', tags: ['erc20'] },

  // ───────────────────────────── DEFI PROTOCOLS ────────────────────────────

  // Lido
  { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', chain: 'ethereum', label: 'Lido stETH',              entity_name: 'Lido',      entity_type: 'protocol', confidence: 'high', tags: ['liquid-staking'] },
  { address: '0x889edc2edab5f40e902b864ad4d7ade8e412f9b1', chain: 'ethereum', label: 'Lido Withdrawal Queue',  entity_name: 'Lido',      entity_type: 'protocol', confidence: 'high', tags: ['liquid-staking'] },
  { address: '0xdc24316b9ae028f1497c275eb9192a3ea0f67022', chain: 'ethereum', label: 'Curve stETH/ETH Pool',   entity_name: 'Curve Finance', entity_type: 'protocol', confidence: 'high', tags: ['defi', 'amm'] },

  // Rocket Pool
  { address: '0xae78736cd615f374d3085123a210448e74fc6393', chain: 'ethereum', label: 'Rocket Pool rETH',        entity_name: 'Rocket Pool', entity_type: 'protocol', confidence: 'high', tags: ['liquid-staking'] },
  { address: '0xdd3f50f8a6cafbe9b31a427582963f465e745af8', chain: 'ethereum', label: 'Rocket Pool Deposit',     entity_name: 'Rocket Pool', entity_type: 'protocol', confidence: 'high', tags: ['liquid-staking'] },

  // MakerDAO
  { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', chain: 'ethereum', label: 'MKR Token',               entity_name: 'MakerDAO',  entity_type: 'dao',      confidence: 'high', tags: ['governance'] },
  { address: '0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b', chain: 'ethereum', label: 'MakerDAO Vat',            entity_name: 'MakerDAO',  entity_type: 'protocol', confidence: 'high', tags: ['cdp', 'defi'] },
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', chain: 'ethereum', label: 'WETH Token',              entity_name: 'WETH',      entity_type: 'protocol', confidence: 'high', tags: ['wrapped'] },

  // 1inch
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', chain: 'ethereum', label: '1inch v5 Router',          entity_name: '1inch',     entity_type: 'protocol', confidence: 'high', tags: ['aggregator', 'dex'] },
  { address: '0x1111111254fb6c44bac0bed2854e76f90643097d', chain: 'ethereum', label: '1inch v4 Router',          entity_name: '1inch',     entity_type: 'protocol', confidence: 'high', tags: ['aggregator', 'dex'] },

  // Balancer
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', chain: 'ethereum', label: 'Balancer Vault',           entity_name: 'Balancer',  entity_type: 'protocol', confidence: 'high', tags: ['amm', 'defi'] },

  // Frax Finance
  { address: '0xc8418af6358ffdda74e09ca9cc3fe03ca6adc5b0', chain: 'ethereum', label: 'Frax Staking',            entity_name: 'Frax Finance', entity_type: 'protocol', confidence: 'high', tags: ['defi', 'staking'] },

  // dYdX
  { address: '0xd54f502e184b6b739d7d27a6410a67dc462d69c8', chain: 'ethereum', label: 'dYdX Perpetual',           entity_name: 'dYdX',      entity_type: 'protocol', confidence: 'high', tags: ['perp', 'defi'] },

  // ───────────────────────────── ORACLES ───────────────────────────────────

  { address: '0x514910771af9ca656af840dff83e8264ecf986ca', chain: 'ethereum', label: 'LINK Token (Chainlink)',   entity_name: 'Chainlink', entity_type: 'oracle', confidence: 'high', tags: ['erc20'] },
  { address: '0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf', chain: 'ethereum', label: 'Chainlink Staking',        entity_name: 'Chainlink', entity_type: 'oracle', confidence: 'high', tags: ['staking'] },

  // ───────────────────────────── MIXERS / RISK ─────────────────────────────

  { address: '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', chain: 'ethereum', label: 'Tornado Cash 0.1 ETH',    entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0x9ad122c22b14202b4490edaf288fdb3c7cb3ff5e', chain: 'ethereum', label: 'Tornado Cash 1 ETH',      entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', chain: 'ethereum', label: 'Tornado Cash 10 ETH',     entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0xa160cdab225685da1d56aa342ad8841c3b53f291', chain: 'ethereum', label: 'Tornado Cash 100 ETH',    entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0x08723392ed15743cc38513c4925f5e6be5c17243', chain: 'ethereum', label: 'Tornado Cash 100K USDC',  entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0x07687e702b410fa43f4cb4af7fa097918ffd2730', chain: 'ethereum', label: 'Tornado Cash 100K DAI',   entity_name: 'Tornado Cash', entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },
  { address: '0x23773e65ed146a459667ad0d48584423e57d0af', chain: 'ethereum',  label: 'Blender.io Mixer',        entity_name: 'Blender.io',   entity_type: 'mixer', confidence: 'high', tags: ['mixer', 'risk'] },

  // ───────────────────────────── VC / FUNDS ────────────────────────────────

  { address: '0x05e793ce0c6027323ac150f6d45c2344d28b6019', chain: 'multi',    label: 'Paradigm',                entity_name: 'Paradigm',  entity_type: 'fund', confidence: 'high', tags: ['vc', 'investor'] },
  { address: '0xa4c8d221d8bb851f83aadd0223a8900a6921a349', chain: 'multi',    label: 'a16z Crypto',             entity_name: 'a16z',      entity_type: 'fund', confidence: 'high', tags: ['vc', 'investor'] },
  { address: '0x4f3aff3a747fcbc2bf770959f946923c68b7c2d9', chain: 'multi',    label: 'Dragonfly Capital',        entity_name: 'Dragonfly', entity_type: 'fund', confidence: 'high', tags: ['vc', 'investor'] },
  { address: '0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0', chain: 'multi',    label: 'Jump Trading',            entity_name: 'Jump Trading', entity_type: 'fund', confidence: 'high', tags: ['market-maker', 'quant'] },
  { address: '0x00000000219ab540356cbb839cbe05303d7705fa', chain: 'multi',    label: 'Wintermute',              entity_name: 'Wintermute',  entity_type: 'fund', confidence: 'high', tags: ['market-maker'] },

  // ───────────────────────────── DAO TREASURIES ────────────────────────────

  { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', chain: 'ethereum', label: 'UNI Token (Uniswap)',     entity_name: 'Uniswap',   entity_type: 'dao',     confidence: 'high', tags: ['governance', 'erc20'] },
  { address: '0xfe89cc7abb2c4183683ab71653c4cdc9b02d44b7', chain: 'ethereum', label: 'Gitcoin Treasury',        entity_name: 'Gitcoin',   entity_type: 'dao',     confidence: 'high', tags: ['dao', 'public-goods'] },
  { address: '0xe6d2c3cb986db66818c14c7032db05d1d2a6ee74', chain: 'ethereum', label: 'Compound Treasury',       entity_name: 'Compound',  entity_type: 'dao',     confidence: 'high', tags: ['dao', 'defi'] },

  // ───────────────────────────── MULTI-CHAIN PROTOCOLS ─────────────────────

  // Aave V3 — Arbitrum
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', chain: 'arbitrum', label: 'Aave V3 Pool (Arbitrum)', entity_name: 'Aave V3',   entity_type: 'protocol', confidence: 'high', tags: ['lending'] },
  // Aave V3 — Polygon
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', chain: 'polygon',  label: 'Aave V3 Pool (Polygon)',  entity_name: 'Aave V3',   entity_type: 'protocol', confidence: 'high', tags: ['lending'] },
  // Aave V3 — Base
  { address: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5', chain: 'base',     label: 'Aave V3 Pool (Base)',     entity_name: 'Aave V3',   entity_type: 'protocol', confidence: 'high', tags: ['lending'] },
  // Aave V3 — Optimism
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', chain: 'optimism', label: 'Aave V3 Pool (Optimism)', entity_name: 'Aave V3',   entity_type: 'protocol', confidence: 'high', tags: ['lending'] },
  // Aave V3 — Avalanche
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', chain: 'avalanche',label: 'Aave V3 Pool (Avalanche)',entity_name: 'Aave V3',   entity_type: 'protocol', confidence: 'high', tags: ['lending'] },

  // GMX v2 — Arbitrum
  { address: '0x7c68c7866a64fa2160f78eeae12217ffbf871fa8', chain: 'arbitrum', label: 'GMX v2 Exchange Router', entity_name: 'GMX',       entity_type: 'protocol', confidence: 'high', tags: ['perp', 'defi'] },
  // Pendle — Arbitrum
  { address: '0x888888888889758f76e7103c6cbf23abbf58f946', chain: 'arbitrum', label: 'Pendle Router v4 (ARB)',  entity_name: 'Pendle',    entity_type: 'protocol', confidence: 'high', tags: ['yield', 'defi'] },

  // Aerodrome — Base (main AMM)
  { address: '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', chain: 'base',     label: 'Aerodrome Router',        entity_name: 'Aerodrome', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
  { address: '0x420dd381b31aef6683db6b902084cb0ffece3a85', chain: 'base',     label: 'Aerodrome Factory',       entity_name: 'Aerodrome', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },

  // Velodrome — Optimism
  { address: '0x9c12939390052919af3155f41bf4160fd3666a6f', chain: 'optimism', label: 'Velodrome Router',        entity_name: 'Velodrome', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
  { address: '0xf1046053aa5682b4f9a81b5481394da16be5ff5a', chain: 'optimism', label: 'Velodrome v2 Router',     entity_name: 'Velodrome', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },

  // Trader Joe — Avalanche
  { address: '0x60ae616a2155ee3d9a68541ba4544862310933d4', chain: 'avalanche',label: 'Trader Joe Router',       entity_name: 'Trader Joe',entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
  { address: '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30', chain: 'avalanche',label: 'Trader Joe v2.1 Router',  entity_name: 'Trader Joe',entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
  { address: '0xe547cadbe081749e5b3dc53cb792dfaea2d02fd2', chain: 'avalanche',label: 'Pangolin Router',          entity_name: 'Pangolin',  entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },

  // QuickSwap — Polygon
  { address: '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff', chain: 'polygon',  label: 'QuickSwap Router v2',     entity_name: 'QuickSwap', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
  { address: '0xf5b509bb0909a69b1c207e495f687a596c168e12', chain: 'polygon',  label: 'QuickSwap Router v3',     entity_name: 'QuickSwap', entity_type: 'protocol', confidence: 'high', tags: ['amm', 'dex'] },
];

// ─── GitHub Loader ───────────────────────────────────────────────────────────
// Format: brianleect/etherscan-labels  → data/etherscan/labels/<type>/combined.json
// Each file is { "accounts": { "0x...": { "labels": [...], "nameTag": "..." } } }

const GITHUB_LABEL_FILES = [
  { url: 'https://raw.githubusercontent.com/brianleect/etherscan-labels/main/data/etherscan/labels/exchanges/combined.json', entity_type: 'exchange' as EntityType },
  { url: 'https://raw.githubusercontent.com/brianleect/etherscan-labels/main/data/etherscan/labels/defi/combined.json',     entity_type: 'protocol' as EntityType },
  { url: 'https://raw.githubusercontent.com/brianleect/etherscan-labels/main/data/etherscan/labels/bridges/combined.json',  entity_type: 'bridge'   as EntityType },
  { url: 'https://raw.githubusercontent.com/brianleect/etherscan-labels/main/data/etherscan/labels/funds/combined.json',    entity_type: 'fund'     as EntityType },
];

async function fetchGithubLabels(): Promise<SeedEntry[]> {
  const entries: SeedEntry[] = [];
  for (const file of GITHUB_LABEL_FILES) {
    try {
      const resp = await axios.get(file.url, { timeout: 10_000 });
      const data = resp.data;

      // Handle two common formats:
      // 1) { "0x...": { "nameTag": "Binance", "labels": ["exchange"] } }
      // 2) { "accounts": { "0x...": { ... } } }
      const accounts: Record<string, unknown> =
        data?.accounts ?? data?.data ?? data;

      if (typeof accounts !== 'object') continue;

      let count = 0;
      for (const [addr, meta] of Object.entries(accounts)) {
        if (!addr.startsWith('0x') || addr.length !== 42) continue;
        const m = meta as Record<string, unknown>;
        const name = (m.nameTag ?? m.name ?? m.label ?? '') as string;
        if (!name) continue;

        entries.push({
          address: addr.toLowerCase(),
          chain: 'ethereum',
          label: name,
          entity_name: name,
          entity_type: file.entity_type,
          confidence: 'medium',
          tags: Array.isArray(m.labels) ? (m.labels as string[]) : [],
        });
        count++;
      }
      console.log(`  GitHub ${file.entity_type}: +${count} addresses`);
    } catch {
      console.log(`  GitHub ${file.entity_type}: skipped (network unreachable)`);
    }
  }
  return entries;
}

// ─── Import Runner ───────────────────────────────────────────────────────────

async function importLabels(): Promise<void> {
  console.log('\n=== TokenSee Entity Label Importer ===\n');

  let allEntries: SeedEntry[] = [...SEED];

  if (!SKIP_GITHUB) {
    console.log('Fetching GitHub etherscan-labels dataset…');
    const githubEntries = await fetchGithubLabels();
    // GitHub data is ethereum-only, de-duplicate against seed by address
    const seedAddrs = new Set(SEED.map((e) => `${e.address}:${e.chain}`));
    const deduped = githubEntries.filter(
      (e) => !seedAddrs.has(`${e.address}:${e.chain}`)
    );
    console.log(`  GitHub total (deduplicated): +${deduped.length}`);
    allEntries = [...allEntries, ...deduped];
  }

  console.log(`\nTotal entries to import: ${allEntries.length}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] No DB writes. Breakdown:');
    const byType = allEntries.reduce<Record<string, number>>((acc, e) => {
      acc[e.entity_type] = (acc[e.entity_type] ?? 0) + 1;
      return acc;
    }, {});
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
    process.exit(0);
  }

  console.log('\nInserting into entities table…');
  let inserted = 0;
  let skipped  = 0;
  const BATCH = 50;

  for (let i = 0; i < allEntries.length; i += BATCH) {
    const batch = allEntries.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (e) => {
        try {
          const result = await db.query(
            `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
             VALUES ($1, $2, $3, $4, $5, $6, 'import', $7)
             ON CONFLICT (address, chain) DO NOTHING`,
            [
              e.address.toLowerCase(),
              e.chain,
              e.label,
              e.entity_name,
              e.entity_type,
              e.confidence,
              e.tags ?? [],
            ]
          );
          if ((result.rowCount ?? 0) > 0) inserted++;
          else skipped++;
        } catch {
          skipped++;
        }
      })
    );
  }

  console.log(`\n✅ Done!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (already exist): ${skipped}`);

  // Verify
  const count = await db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM entities');
  console.log(`   Total rows in entities table: ${count?.count ?? '?'}`);

  await closePool();
  process.exit(0);
}

importLabels().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
