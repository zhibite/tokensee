/**
 * AlertRulesService — manages custom alert rules.
 *
 * A rule has conditions (chains, assets, min_usd, alert_types, addresses)
 * and an action (dispatch to a specific webhook).
 * When WhaleMonitor emits an alert, evaluateAll() is called to fan out
 * to any matching rule's webhook.
 */

import { db } from '../db/Database.js';
import { webhookService } from '../webhook/WebhookService.js';

export interface AlertRuleConditions {
  chains?:        string[];   // e.g. ['ethereum', 'arbitrum']
  asset_symbols?: string[];   // e.g. ['ETH', 'USDC']
  alert_types?:   string[];   // e.g. ['exchange_inflow', 'whale_movement']
  addresses?:     string[];   // watch specific from/to addresses
  min_usd?:       number;
  max_usd?:       number;
}

export interface AlertRule {
  id:                string;
  name:              string;
  description:       string | null;
  conditions:        AlertRuleConditions;
  webhook_id:        string | null;
  active:            boolean;
  triggered_count:   number;
  last_triggered_at: string | null;
  created_at:        string;
  updated_at:        string;
}

export interface CreateAlertRuleInput {
  name:        string;
  description?: string;
  conditions:  AlertRuleConditions;
  webhook_id?: string;
}

class AlertRulesService {
  async list(): Promise<AlertRule[]> {
    try {
      const result = await db.query(
        `SELECT id, name, description, conditions, webhook_id, active,
                triggered_count, last_triggered_at, created_at, updated_at
         FROM alert_rules ORDER BY created_at DESC`
      );
      return result.rows.map(this.rowToRule);
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<AlertRule | null> {
    try {
      const result = await db.query(
        `SELECT id, name, description, conditions, webhook_id, active,
                triggered_count, last_triggered_at, created_at, updated_at
         FROM alert_rules WHERE id = $1`,
        [id]
      );
      return result.rows[0] ? this.rowToRule(result.rows[0]) : null;
    } catch {
      return null;
    }
  }

  async create(input: CreateAlertRuleInput): Promise<AlertRule> {
    const result = await db.query(
      `INSERT INTO alert_rules (name, description, conditions, webhook_id)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, name, description, conditions, webhook_id, active,
                 triggered_count, last_triggered_at, created_at, updated_at`,
      [input.name, input.description ?? null, JSON.stringify(input.conditions), input.webhook_id ?? null]
    );
    return this.rowToRule(result.rows[0]);
  }

  async update(id: string, patch: Partial<CreateAlertRuleInput & { active: boolean }>): Promise<AlertRule | null> {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if (patch.name        !== undefined) { sets.push(`name = $${i++}`);        args.push(patch.name); }
    if (patch.description !== undefined) { sets.push(`description = $${i++}`); args.push(patch.description); }
    if (patch.conditions  !== undefined) { sets.push(`conditions = $${i++}::jsonb`); args.push(JSON.stringify(patch.conditions)); }
    if (patch.webhook_id  !== undefined) { sets.push(`webhook_id = $${i++}`);  args.push(patch.webhook_id); }
    if (patch.active      !== undefined) { sets.push(`active = $${i++}`);      args.push(patch.active); }

    if (sets.length === 0) return this.get(id);

    args.push(id);
    const result = await db.query(
      `UPDATE alert_rules SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, name, description, conditions, webhook_id, active,
                 triggered_count, last_triggered_at, created_at, updated_at`,
      args
    );
    return result.rows[0] ? this.rowToRule(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await db.query('DELETE FROM alert_rules WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Called by WhaleMonitor for every new alert.
   * Evaluates all active rules and dispatches to matching webhooks.
   */
  async evaluateAll(alert: Record<string, unknown>): Promise<void> {
    let rules: AlertRule[];
    try {
      const result = await db.query(
        `SELECT id, name, conditions, webhook_id FROM alert_rules WHERE active = true`
      );
      rules = result.rows.map(this.rowToRule);
    } catch {
      return; // DB unavailable, skip rule evaluation
    }

    const matched: string[] = [];

    for (const rule of rules) {
      if (!rule.webhook_id) continue;
      if (this.matches(alert, rule.conditions)) {
        matched.push(rule.id);
        // Dispatch to the rule's specific webhook (non-blocking)
        webhookService.dispatchToWebhook(rule.webhook_id, alert).catch(() => {});
      }
    }

    if (matched.length > 0) {
      // Increment triggered_count for all matched rules (best-effort)
      db.query(
        `UPDATE alert_rules
         SET triggered_count = triggered_count + 1, last_triggered_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [matched]
      ).catch(() => {});
    }
  }

  private matches(alert: Record<string, unknown>, cond: AlertRuleConditions): boolean {
    const chain      = alert.chain as string;
    const symbol     = alert.asset_symbol as string;
    const alertType  = alert.alert_type as string;
    const amountUsd  = typeof alert.amount_usd === 'number' ? alert.amount_usd : 0;
    const fromAddr   = (alert.from_address as string ?? '').toLowerCase();
    const toAddr     = (alert.to_address   as string ?? '').toLowerCase();

    if (cond.chains?.length        && !cond.chains.includes(chain))                         return false;
    if (cond.asset_symbols?.length && !cond.asset_symbols.includes(symbol))                 return false;
    if (cond.alert_types?.length   && !cond.alert_types.includes(alertType))                return false;
    if (cond.min_usd !== undefined && amountUsd < cond.min_usd)                             return false;
    if (cond.max_usd !== undefined && amountUsd > cond.max_usd)                             return false;
    if (cond.addresses?.length) {
      const addrSet = new Set(cond.addresses.map((a) => a.toLowerCase()));
      if (!addrSet.has(fromAddr) && !addrSet.has(toAddr))                                   return false;
    }

    return true;
  }

  private rowToRule(row: Record<string, unknown>): AlertRule {
    return {
      id:                row.id as string,
      name:              row.name as string,
      description:       row.description as string | null,
      conditions:        (typeof row.conditions === 'string'
                          ? JSON.parse(row.conditions)
                          : row.conditions) as AlertRuleConditions,
      webhook_id:        row.webhook_id as string | null,
      active:            row.active as boolean,
      triggered_count:   row.triggered_count as number,
      last_triggered_at: row.last_triggered_at as string | null,
      created_at:        row.created_at as string,
      updated_at:        row.updated_at as string,
    };
  }
}

export const alertRulesService = new AlertRulesService();
