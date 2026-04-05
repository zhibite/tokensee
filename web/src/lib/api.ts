import type {
  DecodeResponse, DecodeError, PortfolioResult,
  AlertsResult, ActivityResult, EntityWalletsResult, SupportedChain,
  WebhookResult, WebhooksListResult, StatsResult,
  SmartMoneyActivityResult, SmartMoneyWalletsResult, SmartMoneyStatsResult,
  AlertRulesResult, AlertRuleConditions, GraphResult,
  EntitySearchResult, EntityStatsResult, SocialProfileResult,
} from './types';

type ApiFetchInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

const DEFAULT_SERVER_ORIGIN = 'http://127.0.0.1:6000';
const BROWSER_API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/v1`
  : '/api/v1';
const SERVER_API_ORIGIN =
  process.env.API_ORIGIN_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  DEFAULT_SERVER_ORIGIN;
const DEFAULT_TIMEOUT_MS = 8_000;

function getApiBase(): string {
  return typeof window === 'undefined'
    ? `${SERVER_API_ORIGIN}/v1`
    : BROWSER_API_BASE;
}

async function apiFetch(
  path: string,
  init?: ApiFetchInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${getApiBase()}${path}`, { ...init, signal: controller.signal });
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: `Backend unavailable on ${SERVER_API_ORIGIN}`,
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function apiJson<T>(
  path: string,
  init?: ApiFetchInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const res = await apiFetch(path, init, timeoutMs);
  return res.json() as Promise<T>;
}

export async function decodeTx(
  hash: string,
  chain: SupportedChain
): Promise<DecodeResponse | DecodeError> {
  return apiJson<DecodeResponse | DecodeError>('/tx/decode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, chain }),
  });
}

export async function getPortfolio(
  address: string,
  chains: string = 'ethereum,bsc,arbitrum,polygon,base,optimism,avalanche'
): Promise<PortfolioResult> {
  return apiJson<PortfolioResult>(
    `/account/${address}/portfolio?chains=${chains}`,
    { next: { revalidate: 60 } }
  );
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

  return apiJson<AlertsResult>(`/alerts?${qs}`, { next: { revalidate: 30 } });
}

export async function getActivity(
  address: string,
  params?: { chain?: string; limit?: number; cursor?: string }
): Promise<ActivityResult> {
  const qs = new URLSearchParams();
  if (params?.chain)  qs.set('chain',  params.chain);
  if (params?.limit)  qs.set('limit',  String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);

  return apiJson<ActivityResult>(
    `/account/${address}/activity?${qs}`,
    { cache: 'no-store' }
  );
}

export async function getEntityWallets(entityName: string): Promise<EntityWalletsResult> {
  return apiJson<EntityWalletsResult>(
    `/entity/${encodeURIComponent(entityName)}/wallets`,
    { cache: 'no-store' }
  );
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<WebhooksListResult> {
  return apiJson<WebhooksListResult>('/webhooks', { cache: 'no-store' });
}

export async function createWebhook(payload: {
  name: string;
  url: string;
  event_types?: string[];
  chains?: string[];
  min_usd?: number;
}): Promise<WebhookResult> {
  return apiJson<WebhookResult>('/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(id: string): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/webhooks/${id}`, { method: 'DELETE' });
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
  return apiJson<SmartMoneyActivityResult>(`/smart-money/activity?${qs}`, { cache: 'no-store' });
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
  return apiJson<SmartMoneyWalletsResult>(`/smart-money/wallets?${qs}`, { cache: 'no-store' });
}

export async function getSmartMoneyStats(): Promise<SmartMoneyStatsResult> {
  return apiJson<SmartMoneyStatsResult>('/smart-money/stats', { cache: 'no-store' });
}

// ── Alert Rules ──────────────────────────────────────────────────────────────

export async function listAlertRules(): Promise<AlertRulesResult> {
  return apiJson<AlertRulesResult>('/alert-rules', { cache: 'no-store' });
}

export async function createAlertRule(payload: {
  name: string;
  description?: string;
  conditions: AlertRuleConditions;
  webhook_id?: string;
}): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  return apiJson<{ success: boolean; data?: unknown; error?: unknown }>('/alert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAlertRule(id: string): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/alert-rules/${id}`, { method: 'DELETE' });
}

export async function patchAlertRule(id: string, patch: { active?: boolean }): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ── Address Graph ────────────────────────────────────────────────────────────

export async function getAddressGraph(address: string, chain?: string): Promise<GraphResult> {
  const qs = chain ? `?chain=${chain}` : '';
  return apiJson<GraphResult>(`/address/${address}/graph${qs}`, { cache: 'no-store' });
}

// ── Entity Library ───────────────────────────────────────────────────────────

export async function getEntityStats(): Promise<EntityStatsResult> {
  return apiJson<EntityStatsResult>('/entity/stats', { cache: 'no-store' });
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
  return apiJson<EntitySearchResult>(`/entity/search?${qs}`, { cache: 'no-store' });
}

export async function addEntity(payload: {
  address: string; chain: string; label: string;
  entity_name: string; entity_type: string; confidence?: string; tags?: string[];
}): Promise<{ success: boolean; data?: unknown; error?: { message: string } }> {
  return apiJson<{ success: boolean; data?: unknown; error?: { message: string } }>('/entity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteEntity(
  address: string, chain: string
): Promise<{ success: boolean; error?: { message: string } }> {
  return apiJson<{ success: boolean; error?: { message: string } }>(
    `/entity/${address}?chain=${chain}`,
    { method: 'DELETE' }
  );
}

// ── Social Identity ──────────────────────────────────────────────────────────

export async function getSocialProfile(address: string): Promise<SocialProfileResult> {
  return apiJson<SocialProfileResult>(`/address/${address}/social`, { cache: 'no-store' });
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(window: '1h' | '24h' | '7d' = '24h'): Promise<StatsResult> {
  return apiJson<StatsResult>(`/stats?window=${window}`, {
    next: { revalidate: 60 },
  });
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
  return apiJson<IntelligenceResult>(`/intelligence?${qs}`, { cache: 'no-store' });
}

// ── Security ─────────────────────────────────────────────────────────────────

export async function getSecuritySummary(): Promise<SecuritySummaryResult> {
  return apiJson<SecuritySummaryResult>('/security/summary', { cache: 'no-store' });
}

export async function getSecurityHackers(params?: { limit?: number; days?: number }): Promise<SecurityHackersResult> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.days)  qs.set('days',  String(params.days));
  return apiJson<SecurityHackersResult>(`/security/hackers?${qs}`, { cache: 'no-store' });
}

export async function getSecurityMixers(): Promise<SecurityMixersResult> {
  return apiJson<SecurityMixersResult>('/security/mixers', { cache: 'no-store' });
}

export async function getSecuritySanctioned(params?: { limit?: number }): Promise<SecuritySanctionedResult> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiJson<SecuritySanctionedResult>(`/security/sanctioned?${qs}`, { cache: 'no-store' });
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
  return apiJson<FlowPairsResult>(`/flow/pairs?${qs}`, { cache: 'no-store' });
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
