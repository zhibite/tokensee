import type { SupportedChain } from './chain.types.js';

export type TransactionType =
  | 'swap'
  | 'transfer'
  | 'liquidity_add'
  | 'liquidity_remove'
  | 'borrow'
  | 'repay'
  | 'stake'
  | 'nft_mint'
  | 'nft_transfer'
  | 'contract_deploy'
  | 'contract_interaction'
  | 'unknown';

export type DecodeMethod = 'known_abi' | 'four_byte' | 'event_only' | 'raw';

export interface AssetAmount {
  address: string; // contract address, '0x0000000000000000000000000000000000000000' for native
  symbol: string;
  decimals: number;
  amount: string; // human-readable decimal string e.g. "1.500000"
  amount_raw: string; // raw bigint as string
  amount_usd?: string;
}

export interface DecodedTransaction {
  // Identity
  hash: string;
  chain: SupportedChain;
  block_number: number;
  timestamp: number;

  // Parties
  sender: string;
  sender_entity: { label: string; entity_name: string; entity_type: string } | null;
  contract_address: string | null;
  contract_entity: { label: string; entity_name: string; entity_type: string } | null;

  // Semantic classification
  type: TransactionType;
  protocol: string | null; // 'uniswap-v3', 'aave-v3', null for unknown
  protocol_version: string | null;

  // Human summary — the headline field
  summary: string;

  // Assets moved
  assets_in: AssetAmount[];
  assets_out: AssetAmount[];

  // Costs
  gas_used: string;
  gas_price_gwei: string;
  fee_eth: string;
  fee_usd: string | null;

  // Raw decoded function call
  function_name: string | null;
  function_args: Record<string, unknown> | null;

  // Decode confidence
  decode_method: DecodeMethod;

  // MEV classification (null = not MEV)
  mev_type?: 'flashloan' | 'arbitrage' | 'sandwich_bot' | null;
}

export interface TxDecodeRequest {
  hash: string;
  chain: SupportedChain;
}

export interface TxDecodeResponse {
  success: true;
  data: DecodedTransaction;
  cached: boolean;
  decode_latency_ms: number;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
