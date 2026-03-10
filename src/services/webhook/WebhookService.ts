/**
 * WebhookService — dispatches whale alert payloads to registered user URLs.
 *
 * Delivery flow:
 * 1. WhaleMonitor emits 'alert' event after DB insert
 * 2. WebhookService.dispatch(alert) is called
 * 3. All active webhooks matching event_type + chain + min_usd are fetched
 * 4. HTTP POST is sent to each URL with HMAC-SHA256 signature
 * 5. Retry up to 3 times with exponential backoff on failure
 * 6. Delivery result is logged to webhook_deliveries table
 */

import axios from 'axios';
import { createHmac } from 'crypto';
import { db } from '../db/Database.js';

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  event_types: string[];
  chains: string[];
  min_usd: string;
}

interface AlertPayload {
  id: string;
  tx_hash: string;
  chain: string;
  alert_type: string;
  amount_usd: number | null;
  from_address: string;
  from_label: string | null;
  to_address: string;
  to_label: string | null;
  asset_symbol: string;
  amount: string;
  timestamp: number;
  created_at: string;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS  = 8_000;

export class WebhookService {
  /**
   * Dispatch to a specific webhook by ID (used by AlertRulesService).
   */
  async dispatchToWebhook(webhookId: string, alert: Record<string, unknown>): Promise<void> {
    try {
      const result = await db.query<WebhookRow>(
        `SELECT id, url, secret, event_types, chains, min_usd FROM webhooks WHERE id = $1 AND active = TRUE`,
        [webhookId]
      );
      if (result.rows[0]) {
        await this.deliver(result.rows[0], alert as unknown as AlertPayload);
      }
    } catch { /* ignore */ }
  }

  /**
   * Called by WhaleMonitor after a new alert is persisted.
   * Runs async without blocking the monitor.
   */
  async dispatch(alert: AlertPayload): Promise<void> {
    let webhooks: WebhookRow[];
    try {
      const result = await db.query<WebhookRow>(
        `SELECT id, url, secret, event_types, chains, min_usd
         FROM webhooks
         WHERE active = TRUE
           AND $1 = ANY(event_types)
           AND $2 = ANY(chains)
           AND ($3::numeric IS NULL OR min_usd <= $3::numeric)`,
        [alert.alert_type, alert.chain, alert.amount_usd?.toString() ?? null]
      );
      webhooks = result.rows;
    } catch {
      return; // DB unavailable — skip silently
    }

    // Fire all deliveries concurrently (each has its own retry loop)
    await Promise.allSettled(webhooks.map((wh) => this.deliver(wh, alert)));
  }

  private async deliver(webhook: WebhookRow, alert: AlertPayload): Promise<void> {
    const body = JSON.stringify({ event: 'whale_alert', data: alert });
    const signature = this.sign(body, webhook.secret);

    let lastError = '';
    let statusCode: number | undefined;
    let responseMs = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const start = Date.now();
      try {
        const res = await axios.post(webhook.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-TokenSee-Signature': `sha256=${signature}`,
            'X-TokenSee-Event': 'whale_alert',
            'User-Agent': 'TokenSee-Webhook/1.0',
          },
          timeout: TIMEOUT_MS,
          validateStatus: () => true, // don't throw on non-2xx
        });

        responseMs = Date.now() - start;
        statusCode = res.status;
        const success = res.status >= 200 && res.status < 300;

        await this.logDelivery(webhook.id, alert.id, attempt, statusCode, success, responseMs, null);

        if (success) return;

        lastError = `HTTP ${res.status}`;
      } catch (err) {
        responseMs = Date.now() - start;
        lastError = err instanceof Error ? err.message : String(err);
        await this.logDelivery(webhook.id, alert.id, attempt, statusCode, false, responseMs, lastError);
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }

    console.warn(`[Webhook] All ${MAX_RETRIES} attempts failed for webhook ${webhook.id}: ${lastError}`);
  }

  private sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  private async logDelivery(
    webhookId: string,
    alertId: string,
    attempt: number,
    statusCode: number | undefined,
    success: boolean,
    responseMs: number,
    error: string | null
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, alert_id, attempt, status_code, success, response_ms, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [webhookId, alertId, attempt, statusCode ?? null, success, responseMs, error]
      );
    } catch { /* ignore log failures */ }
  }
}

export const webhookService = new WebhookService();
