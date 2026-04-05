/**
 * Webhook management API
 *
 * POST   /v1/webhooks          — register a new webhook
 * GET    /v1/webhooks          — list all webhooks
 * DELETE /v1/webhooks/:id      — delete a webhook
 * GET    /v1/webhooks/:id/logs — delivery log for a webhook
 *
 * Signature verification (client side):
 *   const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
 *   if (`sha256=${sig}` !== req.headers['x-tokensee-signature']) return 401;
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { db } from '../../services/db/Database.js';
import type { ApiError } from '../../types/transaction.types.js';
import { getWebhookUrlSafety } from '../../services/webhook/WebhookUrlPolicy.js';

export const webhookRoutes = Router();

const VALID_EVENT_TYPES = [
  'large_transfer', 'exchange_inflow', 'exchange_outflow',
  'whale_movement', 'bridge_deposit', 'bridge_withdrawal',
];
const VALID_CHAINS = ['ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche'];

// POST /v1/webhooks — register a new webhook
webhookRoutes.post('/', async (req: Request, res: Response) => {
  const { name, url, event_types, chains, min_usd } = req.body as {
    name?: string;
    url?: string;
    event_types?: string[];
    chains?: string[];
    min_usd?: number;
  };

  if (!name || typeof name !== 'string' || name.length > 80) {
    const error: ApiError = { success: false, error: { code: 'INVALID_NAME', message: 'name is required (max 80 chars)' } };
    return res.status(400).json(error);
  }
  if (!url || !isValidHttpUrl(url)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_URL', message: 'url must be a valid http/https URL' } };
    return res.status(400).json(error);
  }
  const safety = await getWebhookUrlSafety(url);
  if (!safety.safe) {
    const error: ApiError = { success: false, error: { code: 'UNSAFE_URL', message: safety.reason ?? 'webhook url is not allowed' } };
    return res.status(400).json(error);
  }

  const types  = event_types?.filter((t) => VALID_EVENT_TYPES.includes(t)) ?? VALID_EVENT_TYPES;
  const chains_ = chains?.filter((c) => VALID_CHAINS.includes(c)) ?? VALID_CHAINS;
  const minUsd = typeof min_usd === 'number' && min_usd >= 0 ? min_usd : 100_000;

  // Generate signing secret
  const secret = randomBytes(32).toString('hex');

  try {
    const result = await db.query<{ id: string }>(
      `INSERT INTO webhooks (name, url, secret, event_types, chains, min_usd)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, url, secret, types, chains_, minUsd]
    );
    const id = result.rows[0].id;

    return res.status(201).json({
      success: true,
      data: {
        id, name, url, secret,  // secret returned ONCE — store it securely
        event_types: types, chains: chains_, min_usd: minUsd,
        active: true,
      },
      message: 'Store the secret securely — it will not be shown again.',
    });
  } catch (err) {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: (err as Error).message } };
    return res.status(500).json(error);
  }
});

// GET /v1/webhooks — list webhooks
webhookRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, url, event_types, chains, min_usd, active, created_at
       FROM webhooks ORDER BY created_at DESC`
    );
    return res.json({ success: true, data: { items: result.rows } });
  } catch {
    return res.json({ success: true, data: { items: [] } });
  }
});

// DELETE /v1/webhooks/:id
webhookRoutes.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'invalid webhook id' } });
  }
  try {
    const result = await db.query(`DELETE FROM webhooks WHERE id = $1 RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'webhook not found' } });
    }
    return res.json({ success: true, data: { deleted: id } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: (err as Error).message } });
  }
});

// GET /v1/webhooks/:id/logs — recent delivery log
webhookRoutes.get('/:id/logs', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'invalid webhook id' } });
  }
  try {
    const result = await db.query(
      `SELECT id, alert_id, attempt, status_code, success, response_ms, error, delivered_at
       FROM webhook_deliveries WHERE webhook_id = $1
       ORDER BY delivered_at DESC LIMIT 50`,
      [id]
    );
    return res.json({ success: true, data: result.rows });
  } catch {
    return res.json({ success: true, data: [] });
  }
});

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
