import type {
  DecodeResponse, DecodeError, PortfolioResult,
  AlertsResult, ActivityResult, EntityWalletsResult, SupportedChain,
  WebhookResult, WebhooksListResult, StatsResult,
  SmartMoneyActivityResult, SmartMoneyWalletsResult, SmartMoneyStatsResult,
  AlertRulesResult, AlertRuleConditions, GraphResult,
  EntitySearchResult, EntityStatsResult, SocialProfileResult,
} from './types';

// Prefer same-origin proxy in dev (works for LAN access too).
// If NEXT_PUBLIC_API_URL is set, use it as absolute origin.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const API_V1 = API_BASE ? `${API_BASE}/v1` : '/api/v1';

export async function decodeTx(
  hash: string,
  chain: SupportedChain
): Promise<DecodeResponse | DecodeError> {
  const res = await fetch(`${API_V1}/tx/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, chain }),
  });
  return res.json();
}

export async function getPortfolio(
  address: string,
  chains: string = 'ethereum,bsc,arbitrum,polygon,base,optimism,avalanche'
): Promise<PortfolioResult> {
  const res = await fetch(
    `${API_V1}/account/${address}/portfolio?chains=${chains}`,
    { next: { revalidate: 60 } }
  );
  return res.json();
}

export async function getAlerts(params?: {
  chain?: string;
  type?: string;
  min_usd?: number;
  limit?: number;
  cursor?: string;
}): Promise<AlertsResult> {
  const qs = new URLSearchParams();
  if (params?.chain)   qs.set('chain',   params.chain);
  if (params?.type)    qs.set('type',    params.type);
  if (params?.min_usd) qs.set('min_usd', String(params.min_usd));
  if (params?.limit)   qs.set('limit',   String(params.limit));
  if (params?.cursor)  qs.set('cursor',  params.cursor);

  const res = await fetch(`${API_V1}/alerts?${qs}`, { next: { revalidate: 30 } });
  return res.json();
}

export async function getActivity(
  address: string,
  params?: { chain?: string; limit?: number; cursor?: string }
): Promise<ActivityResult> {
  const qs = new URLSearchParams();
  if (params?.chain)  qs.set('chain',  params.chain);
  if (params?.limit)  qs.set('limit',  String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);

  const res = await fetch(
    `${API_V1}/account/${address}/activity?${qs}`,
    { cache: 'no-store' }
  );
  return res.json();
}

export async function getEntityWallets(entityName: string): Promise<EntityWalletsResult> {
  const res = await fetch(
    `${API_V1}/entity/${encodeURIComponent(entityName)}/wallets`,
    { cache: 'no-store' }
  );
  return res.json();
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<WebhooksListResult> {
  const res = await fetch(`${API_V1}/webhooks`, { cache: 'no-store' });
  return res.json();
}

export async function createWebhook(payload: {
  name: string;
  url: string;
  event_types?: string[];
  chains?: string[];
  min_usd?: number;
}): Promise<WebhookResult> {
  const res = await fetch(`${API_V1}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteWebhook(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_V1}/webhooks/${id}`, { method: 'DELETE' });
  return res.json();
}

// ── Smart Money ─────────────────────────────────────────────────────────────

export async function getSmartMoneyActivity(params?: {
  chain?: string;
  category?: string;
  limit?: number;
  cursor?: string;
}): Promise<SmartMoneyActivityResult> {
  const qs = new URLSearchParams();
  if (params?.chain)    qs.set('chain',    params.chain);
  if (params?.category) qs.set('category', params.category);
  if (params?.limit)    qs.set('limit',    String(params.limit));
  if (params?.cursor)   qs.set('cursor',   params.cursor);
  const res = await fetch(`${API_V1}/smart-money/activity?${qs}`, { cache: 'no-store' });
  return res.json();
}

export async function getSmartMoneyWallets(params?: {
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<SmartMoneyWalletsResult> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.limit)    qs.set('limit',    String(params.limit));
  if (params?.offset)   qs.set('offset',   String(params.offset));
  const res = await fetch(`${API_V1}/smart-money/wallets?${qs}`, { cache: 'no-store' });
  return res.json();
}

export async function getSmartMoneyStats(): Promise<SmartMoneyStatsResult> {
  const res = await fetch(`${API_V1}/smart-money/stats`, { cache: 'no-store' });
  return res.json();
}

// ── Alert Rules ──────────────────────────────────────────────────────────────

export async function listAlertRules(): Promise<AlertRulesResult> {
  const res = await fetch(`${API_V1}/alert-rules`, { cache: 'no-store' });
  return res.json();
}

export async function createAlertRule(payload: {
  name: string;
  description?: string;
  conditions: AlertRuleConditions;
  webhook_id?: string;
}): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  const res = await fetch(`${API_V1}/alert-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteAlertRule(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_V1}/alert-rules/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function patchAlertRule(id: string, patch: { active?: boolean }): Promise<{ success: boolean }> {
  const res = await fetch(`${API_V1}/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}

// ── Address Graph ────────────────────────────────────────────────────────────

export async function getAddressGraph(address: string, chain?: string): Promise<GraphResult> {
  const qs = chain ? `?chain=${chain}` : '';
  const res = await fetch(`${API_V1}/address/${address}/graph${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── Entity Library ───────────────────────────────────────────────────────────

export async function getEntityStats(): Promise<EntityStatsResult> {
  const res = await fetch(`${API_V1}/entity/stats`, { cache: 'no-store' });
  return res.json();
}

export async function searchEntities(params?: {
  q?: string; type?: string; chain?: string; page?: number; limit?: number;
}): Promise<EntitySearchResult> {
  const qs = new URLSearchParams();
  if (params?.q)     qs.set('q',     params.q);
  if (params?.type)  qs.set('type',  params.type);
  if (params?.chain) qs.set('chain', params.chain);
  if (params?.page)  qs.set('page',  String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await fetch(`${API_V1}/entity/search?${qs}`, { cache: 'no-store' });
  return res.json();
}

export async function addEntity(payload: {
  address: string; chain: string; label: string;
  entity_name: string; entity_type: string; confidence?: string; tags?: string[];
}): Promise<{ success: boolean; data?: unknown; error?: { message: string } }> {
  const res = await fetch(`${API_V1}/entity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteEntity(
  address: string, chain: string
): Promise<{ success: boolean; error?: { message: string } }> {
  const res = await fetch(
    `${API_V1}/entity/${address}?chain=${chain}`,
    { method: 'DELETE' }
  );
  return res.json();
}

// ── Social Identity ──────────────────────────────────────────────────────────

export async function getSocialProfile(address: string): Promise<SocialProfileResult> {
  const res = await fetch(`${API_V1}/address/${address}/social`, { cache: 'no-store' });
  return res.json();
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(window: '1h' | '24h' | '7d' = '24h'): Promise<StatsResult> {
  const res = await fetch(`${API_V1}/stats?window=${window}`, {
    next: { revalidate: 60 },
  });
  return res.json();
}

// ── Intelligence ─────────────────────────────────────────────────────────────

export async function getIntelligence(params?: {
  category?: string;
  chain?: string;
  severity?: string;
  limit?: number;
  cursor?: string;
}): Promise<IntelligenceResult> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.chain)    qs.set('chain',    params.chain);
  if (params?.severity) qs.set('severity', params.severity);
  if (params?.limit)    qs.set('limit',    String(params.limit));
  if (params?.cursor)   qs.set('cursor',   params.cursor);
  const res = await fetch(`${API_V1}/intelligence?${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── Security ─────────────────────────────────────────────────────────────────

export async function getSecuritySummary(): Promise<SecuritySummaryResult> {
  const res = await fetch(`${API_V1}/security/summary`, { cache: 'no-store' });
  return res.json();
}

export async function getSecurityHackers(params?: { limit?: number; days?: number }): Promise<SecurityHackersResult> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.days)  qs.set('days',  String(params.days));
  const res = await fetch(`${API_V1}/security/hackers?${qs}`, { cache: 'no-store' });
  return res.json();
}

export async function getSecurityMixers(): Promise<SecurityMixersResult> {
  const res = await fetch(`${API_V1}/security/mixers`, { cache: 'no-store' });
  return res.json();
}

export async function getSecuritySanctioned(params?: { limit?: number }): Promise<SecuritySanctionedResult> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await fetch(`${API_V1}/security/sanctioned?${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── Fund Flow ─────────────────────────────────────────────────────────────────

export async function getFlowPairs(params?: {
  chain?: string;
  window?: '24h' | '7d' | '30d';
  limit?: number;
}): Promise<FlowPairsResult> {
  const qs = new URLSearchParams();
  if (params?.chain)  qs.set('chain',  params.chain);
  if (params?.window) qs.set('window', params.window);
  if (params?.limit)  qs.set('limit',  String(params.limit));
  const res = await fetch(`${API_V1}/flow/pairs?${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── New result types (inline to avoid circular imports) ───────────────────────

export interface IntelligenceEvent {
  id: string;
  tx_hash: string;
  chain: string;
  timestamp: number;
  created_at: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  narrative: string;
  from: string;
  from_address: string;
  from_type: string | null;
  to: string;
  to_address: string;
  to_type: string | null;
  amount_usd: number | null;
  asset: string;
}

export interface IntelligenceResult {
  success: boolean;
  data?: {
    events: IntelligenceEvent[];
    has_more: boolean;
    cursor: string | null;
    stats: {
      events_today: number;
      critical_alerts: number;
      smart_money_signals: number;
      volume_flagged: number;
    };
  };
  error?: { code: string; message: string };
}

export interface SecuritySummaryResult {
  success: boolean;
  data?: {
    hacker_active: number;
    sanctioned_total: number;
    sanctioned_activity: number;
    mixer_inflow_24h: number;
    mixer_change_pct: number;
  };
}

export interface HackerEvent {
  address: string;
  label: string | null;
  entity: string | null;
  chain: string;
  last_activity: string;
  dest_entity: string | null;
  dest_label: string | null;
  dest_address: string;
  amount_usd: number;
  tx_hash: string;
}

export interface SecurityHackersResult {
  success: boolean;
  data?: { events: HackerEvent[] };
}

export interface MixerStat {
  name: string;
  address: string;
  inflow_24h: number;
  change_pct: number;
  tx_count: number;
}

export interface SecurityMixersResult {
  success: boolean;
  data?: { mixers: MixerStat[] };
}

export interface SecuritySanctionedResult {
  success: boolean;
  data?: { events: unknown[] };
}

export interface FlowPair {
  from: string;
  from_type: string | null;
  from_address: string;
  to: string;
  to_type: string | null;
  to_address: string;
  chain: string;
  volume_usd: number;
  tx_count: number;
}

export interface FlowPairsResult {
  success: boolean;
  data?: {
    pairs: FlowPair[];
    stats: { total_volume: number; total_txns: number; unique_entities: number };
    top_entities: { name: string; type: string | null; volume: number }[];
    window: string;
  };
}
