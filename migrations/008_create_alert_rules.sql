-- Migration 008: Custom alert rules
-- Users can define rules that trigger webhook delivery for matching whale alerts.
-- Conditions stored as JSONB for flexibility.

CREATE TABLE IF NOT EXISTS alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  -- conditions: { chains?, asset_symbols?, min_usd?, max_usd?, alert_types?, addresses? }
  conditions       JSONB NOT NULL DEFAULT '{}',
  -- action: { webhook_id } — links to webhooks table (bigint)
  webhook_id       BIGINT REFERENCES webhooks(id) ON DELETE SET NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  triggered_count  INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(active);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_alert_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_alert_rules_updated_at();
