export type SupportedChain =
  | 'ethereum' | 'bsc' | 'arbitrum' | 'polygon' | 'base' | 'optimism' | 'avalanche';

export interface AssetAmount {
  address: string;
  symbol: string;
  decimals: number;
  amount: string;
  amount_raw: string;
  amount_usd?: string;
}

export interface DecodedTransaction {
  hash: string;
  chain: SupportedChain;
  block_number: number;
  timestamp: number;
  sender: string;
  contract_address: string | null;
  type: string;
  protocol: string | null;
  protocol_version: string | null;
  summary: string;
  assets_in: AssetAmount[];
  assets_out: AssetAmount[];
  gas_used: string;
  gas_price_gwei: string;
  fee_eth: string;   // native token amount (ETH/BNB/MATIC/AVAX)
  fee_usd: string | null;
  function_name: string | null;
  function_args: Record<string, unknown> | null;
  decode_method: 'known_abi' | 'four_byte' | 'event_only' | 'raw';
}

export interface DecodeResponse {
  success: true;
  data: DecodedTransaction;
  cached: boolean;
  decode_latency_ms: number;
}

export interface DecodeError {
  success: false;
  error: { code: string; message: string };
}

// Portfolio types
export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balance_raw: string;
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
  ens_name: string | null;
  chains: ChainPortfolio[];
  total_value_usd: string | null;
}

export interface PortfolioResponse {
  success: true;
  data: Portfolio;
}

export type PortfolioResult = PortfolioResponse | DecodeError;

// Whale alert types
export type AlertType =
  | 'large_transfer'
  | 'exchange_inflow'
  | 'exchange_outflow'
  | 'whale_movement'
  | 'bridge_deposit'
  | 'bridge_withdrawal';

export interface AlertParty {
  address: string;
  label: string | null;
  entity: string | null;
  type: string | null;
}

export interface WhaleAlert {
  id: string;
  tx_hash: string;
  chain: SupportedChain;
  block_number: number;
  timestamp: number;
  from: AlertParty;
  to: AlertParty;
  asset: { address: string; symbol: string };
  amount: string;
  amount_usd: number | null;
  alert_type: AlertType;
  created_at: string;
}

export interface AlertsResponse {
  success: true;
  data: {
    items: WhaleAlert[];
    cursor: string | null;
    has_more: boolean;
  };
}

export type AlertsResult = AlertsResponse | DecodeError;

// Activity types
export interface ActivityItem {
  hash: string;
  chain: SupportedChain;
  block_number: number;
  timestamp: number;
  sender: string;
  contract_address: string | null;
  type: string;
  protocol: string | null;
  summary: string;
  assets_in: AssetAmount[];
  assets_out: AssetAmount[];
  fee_usd: string | null;
  function_name: string | null;
  decode_method: string;
}

export interface ActivityResponse {
  success: true;
  data: {
    items: ActivityItem[];
    cursor: string | null;
    has_more: boolean;
  };
}

export type ActivityResult = ActivityResponse | DecodeError;

// Entity types
export interface EntityWallet {
  address: string;
  label: string;
  entity_name: string;
  entity_type: string;
  tags: string[];
  source: 'static' | 'db';
}

export interface EntityWalletsResponse {
  success: true;
  data: {
    entity_name: string;
    entity_type: string;
    wallet_count: number;
    wallets: EntityWallet[];
  };
}

export type EntityWalletsResult = EntityWalletsResponse | DecodeError;

// Webhook types
export interface Webhook {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  chains: string[];
  min_usd: number;
  active: boolean;
  created_at: string;
}

export interface WebhookCreateResponse {
  success: true;
  data: Webhook & { secret: string };
  message: string;
}

export interface WebhooksListResponse {
  success: true;
  data: { items: Webhook[] };
}

export type WebhookResult = WebhookCreateResponse | DecodeError;
export type WebhooksListResult = WebhooksListResponse | DecodeError;

// Stats types
export interface ChainStat  { chain: string;  count: number; volume_usd: number }
export interface TypeStat   { type: string;   count: number; volume_usd: number }
export interface AssetStat  { symbol: string; count: number; volume_usd: number }

export interface StatsData {
  window: string;
  total_alerts: number;
  total_volume_usd: number;
  by_chain: ChainStat[];
  by_type:  TypeStat[];
  top_assets: AssetStat[];
}

export interface StatsResponse { success: true; data: StatsData }
export type StatsResult = StatsResponse | DecodeError;
