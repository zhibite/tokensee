import type {
  DecodeResponse, DecodeError, PortfolioResult,
  AlertsResult, ActivityResult, EntityWalletsResult, SupportedChain,
  WebhookResult, WebhooksListResult, StatsResult,
  SmartMoneyActivityResult, AlertRulesResult, AlertRuleConditions, GraphResult,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function decodeTx(
  hash: string,
  chain: SupportedChain
): Promise<DecodeResponse | DecodeError> {
  const res = await fetch(`${API_BASE}/v1/tx/decode`, {
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
    `${API_BASE}/v1/account/${address}/portfolio?chains=${chains}`,
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

  const res = await fetch(`${API_BASE}/v1/alerts?${qs}`, { next: { revalidate: 30 } });
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
    `${API_BASE}/v1/account/${address}/activity?${qs}`,
    { cache: 'no-store' }
  );
  return res.json();
}

export async function getEntityWallets(entityName: string): Promise<EntityWalletsResult> {
  const res = await fetch(
    `${API_BASE}/v1/entity/${encodeURIComponent(entityName)}/wallets`,
    { cache: 'no-store' }
  );
  return res.json();
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<WebhooksListResult> {
  const res = await fetch(`${API_BASE}/v1/webhooks`, { cache: 'no-store' });
  return res.json();
}

export async function createWebhook(payload: {
  name: string;
  url: string;
  event_types?: string[];
  chains?: string[];
  min_usd?: number;
}): Promise<WebhookResult> {
  const res = await fetch(`${API_BASE}/v1/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteWebhook(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/v1/webhooks/${id}`, { method: 'DELETE' });
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
  const res = await fetch(`${API_BASE}/v1/smart-money/activity?${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── Alert Rules ──────────────────────────────────────────────────────────────

export async function listAlertRules(): Promise<AlertRulesResult> {
  const res = await fetch(`${API_BASE}/v1/alert-rules`, { cache: 'no-store' });
  return res.json();
}

export async function createAlertRule(payload: {
  name: string;
  description?: string;
  conditions: AlertRuleConditions;
  webhook_id?: string;
}): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  const res = await fetch(`${API_BASE}/v1/alert-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteAlertRule(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/v1/alert-rules/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function patchAlertRule(id: string, patch: { active?: boolean }): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/v1/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}

// ── Address Graph ────────────────────────────────────────────────────────────

export async function getAddressGraph(address: string, chain?: string): Promise<GraphResult> {
  const qs = chain ? `?chain=${chain}` : '';
  const res = await fetch(`${API_BASE}/v1/address/${address}/graph${qs}`, { cache: 'no-store' });
  return res.json();
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(window: '1h' | '24h' | '7d' = '24h'): Promise<StatsResult> {
  const res = await fetch(`${API_BASE}/v1/stats?window=${window}`, {
    next: { revalidate: 60 },
  });
  return res.json();
}
