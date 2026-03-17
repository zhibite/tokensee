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

// Smart Money types
export type SmartMoneyCategory = 'vc' | 'quant' | 'market_maker' | 'whale' | 'dao_treasury';

export interface SmartMoneyWallet {
  address: string;
  name: string;
  category: SmartMoneyCategory;
  tags: string[];
}

export interface SmartMoneyWalletWithActivity extends SmartMoneyWallet {
  activity_30d: number;
}

export interface SmartMoneyWalletsResponse {
  success: true;
  data: { wallets: SmartMoneyWalletWithActivity[]; total: number };
}
export type SmartMoneyWalletsResult = SmartMoneyWalletsResponse | DecodeError;

export interface SmartMoneyCategoryStat {
  count: number; volume_usd: number; wallets: number;
}
export interface SmartMoneyStatsResponse {
  success: true;
  data: { by_category: Record<string, SmartMoneyCategoryStat>; total_wallets: number };
}
export type SmartMoneyStatsResult = SmartMoneyStatsResponse | DecodeError;

export interface SmartMoneyMove {
  id: string;
  wallet_address: string;
  wallet_name: string;
  wallet_category: SmartMoneyCategory;
  role: 'sender' | 'receiver';
  tx_hash: string;
  chain: SupportedChain;
  timestamp: number;
  asset_symbol: string;
  amount: string;
  amount_usd: number | null;
  alert_type: string;
  counterpart_address: string;
  counterpart_label: string | null;
  counterpart_entity: string | null;
  created_at: string;
}

export interface SmartMoneyActivityResponse {
  success: true;
  data: {
    moves: SmartMoneyMove[];
    total: number;
    has_more: boolean;
    cursor: string | null;
  };
}
export type SmartMoneyActivityResult = SmartMoneyActivityResponse | DecodeError;

// Alert Rules types
export interface AlertRuleConditions {
  chains?: string[];
  asset_symbols?: string[];
  alert_types?: string[];
  addresses?: string[];
  min_usd?: number;
  max_usd?: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  conditions: AlertRuleConditions;
  webhook_id: string | null;
  active: boolean;
  triggered_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertRulesResponse { success: true; data: { items: AlertRule[] } }
export type AlertRulesResult = AlertRulesResponse | DecodeError;

// Graph types
export interface GraphNode {
  id: string;
  address: string;
  label: string | null;
  entity_name: string | null;
  entity_type: string | null;
  is_center: boolean;
  tx_count: number;
  volume_usd: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  asset_symbol: string;
  volume_usd: number;
  tx_count: number;
}

export interface GraphData {
  center: string;
  chain: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_volume_usd: number;
  total_tx_count: number;
}

export interface GraphResponse { success: true; data: GraphData }
export type GraphResult = GraphResponse | DecodeError;

// Entity Library types
export interface EntityRecord {
  id: number;
  address: string;
  chain: string;
  label: string;
  entity_name: string;
  entity_type: string;
  confidence: string;
  source: string;
  tags: string[];
}

export interface EntityStatsData {
  total: number;
  by_type:   Record<string, number>;
  by_source: Record<string, number>;
  by_chain:  Record<string, number>;
}

export interface EntitySearchResponse {
  success: true;
  data: { items: EntityRecord[]; total: number; page: number; limit: number };
}
export interface EntityStatsResponse { success: true; data: EntityStatsData }
export type EntitySearchResult = EntitySearchResponse | DecodeError;
export type EntityStatsResult  = EntityStatsResponse  | DecodeError;

// Social Identity types
export type SocialPlatform = 'ens' | 'lens' | 'farcaster' | 'entity';

export interface SocialIdentity {
  platform:    SocialPlatform;
  handle:      string;
  label:       string;
  entity_type: string;
  confidence:  'high' | 'medium' | 'low';
  source:      string;
  chain:       string;
}

export interface SocialProfile {
  address:    string;
  identities: SocialIdentity[];
  ens:        string | null;
  lens:       string | null;
  farcaster:  string | null;
  entity:     string | null;
}

export interface SocialProfileResponse { success: true; data: SocialProfile }
export type SocialProfileResult = SocialProfileResponse | DecodeError;

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
