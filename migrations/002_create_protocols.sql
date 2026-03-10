CREATE TABLE IF NOT EXISTS protocols (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    version         VARCHAR(20),
    category        VARCHAR(30),
    chains          VARCHAR(20)[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protocol_addresses (
    protocol_id     VARCHAR(50) NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    chain           VARCHAR(20) NOT NULL,
    address         VARCHAR(42) NOT NULL,
    label           VARCHAR(100),
    PRIMARY KEY (chain, address)
);

CREATE INDEX IF NOT EXISTS idx_protocol_addresses_protocol ON protocol_addresses(protocol_id);
