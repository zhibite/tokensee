-- Webhooks — user-registered URLs to receive whale alert pushes

CREATE TABLE IF NOT EXISTS webhooks (
  id          BIGSERIAL     PRIMARY KEY,
  name        VARCHAR(80)   NOT NULL,
  url         TEXT          NOT NULL,
  secret      VARCHAR(128)  NOT NULL,        -- HMAC-SHA256 signing secret
  event_types TEXT[]        NOT NULL DEFAULT '{large_transfer,exchange_inflow,exchange_outflow,whale_movement,bridge_deposit,bridge_withdrawal}',
  chains      TEXT[]        NOT NULL DEFAULT '{ethereum,bsc,arbitrum,polygon,base}',
  min_usd     NUMERIC(20,2) NOT NULL DEFAULT 100000,
  active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Delivery log — track each webhook dispatch attempt
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           BIGSERIAL     PRIMARY KEY,
  webhook_id   BIGINT        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  alert_id     BIGINT        NOT NULL,
  attempt      SMALLINT      NOT NULL DEFAULT 1,
  status_code  SMALLINT,
  success      BOOLEAN       NOT NULL DEFAULT FALSE,
  response_ms  INTEGER,
  error        TEXT,
  delivered_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries (webhook_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_alert_idx   ON webhook_deliveries (alert_id);
