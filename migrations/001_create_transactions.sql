CREATE TABLE IF NOT EXISTS transactions (
    id              BIGSERIAL PRIMARY KEY,
    hash            CHAR(66) NOT NULL,
    chain           VARCHAR(20) NOT NULL,
    block_number    BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    sender          VARCHAR(42) NOT NULL,
    to_address      VARCHAR(42),
    value_wei       NUMERIC(78,0) NOT NULL DEFAULT 0,
    status          SMALLINT NOT NULL DEFAULT 1,

    -- Decoded semantic data
    tx_type         VARCHAR(30),
    protocol_id     VARCHAR(50),
    summary         TEXT,
    function_name   VARCHAR(200),
    decode_method   VARCHAR(20),

    -- Assets (JSONB for variable-length asset lists)
    assets_in       JSONB NOT NULL DEFAULT '[]',
    assets_out      JSONB NOT NULL DEFAULT '[]',

    -- Gas & fees
    gas_used        BIGINT,
    gas_price_wei   NUMERIC(30,0),
    fee_usd         NUMERIC(18,6),

    -- Raw data
    raw_input       TEXT,
    function_args   JSONB,

    -- Metadata
    decoded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(hash, chain)
);

CREATE INDEX IF NOT EXISTS idx_tx_chain_hash ON transactions(chain, hash);
CREATE INDEX IF NOT EXISTS idx_tx_sender ON transactions(sender, chain);
CREATE INDEX IF NOT EXISTS idx_tx_protocol ON transactions(protocol_id) WHERE protocol_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(tx_type) WHERE tx_type IS NOT NULL;
