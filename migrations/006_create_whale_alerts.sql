-- Whale alert feed — large on-chain transfers detected by the monitor worker

CREATE TABLE IF NOT EXISTS whale_alerts (
  id             BIGSERIAL   PRIMARY KEY,
  tx_hash        CHAR(66)    NOT NULL,
  chain          VARCHAR(20) NOT NULL,
  block_number   BIGINT      NOT NULL,
  timestamp      BIGINT      NOT NULL,          -- unix seconds

  from_address   CHAR(42)    NOT NULL,
  from_label     VARCHAR(120),                  -- NULL = unknown address
  from_entity    VARCHAR(80),
  from_type      VARCHAR(30),

  to_address     CHAR(42)    NOT NULL,
  to_label       VARCHAR(120),
  to_entity      VARCHAR(80),
  to_type        VARCHAR(30),

  asset_address  CHAR(42)    NOT NULL,          -- 0x0...0 for native
  asset_symbol   VARCHAR(20) NOT NULL,
  amount         NUMERIC(36, 8) NOT NULL,       -- human-readable
  amount_usd     NUMERIC(20, 2),               -- NULL if price unknown

  alert_type     VARCHAR(30) NOT NULL,          -- see CHECK below
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT whale_alerts_type_check CHECK (
    alert_type IN (
      'large_transfer',
      'exchange_inflow',
      'exchange_outflow',
      'whale_movement',
      'bridge_deposit',
      'bridge_withdrawal'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS whale_alerts_tx_asset_idx ON whale_alerts (tx_hash, asset_address);
CREATE INDEX IF NOT EXISTS whale_alerts_chain_ts_idx ON whale_alerts (chain, timestamp DESC);
CREATE INDEX IF NOT EXISTS whale_alerts_from_idx ON whale_alerts (from_address);
CREATE INDEX IF NOT EXISTS whale_alerts_to_idx ON whale_alerts (to_address);
CREATE INDEX IF NOT EXISTS whale_alerts_alert_type_idx ON whale_alerts (alert_type);
CREATE INDEX IF NOT EXISTS whale_alerts_amount_usd_idx ON whale_alerts (amount_usd DESC);
