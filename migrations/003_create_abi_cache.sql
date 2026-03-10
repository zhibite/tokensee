-- Persists 4byte.directory results to avoid repeated external API calls
CREATE TABLE IF NOT EXISTS abi_selector_cache (
    selector        VARCHAR(10) PRIMARY KEY,
    text_signature  TEXT NOT NULL,
    source          VARCHAR(30) NOT NULL DEFAULT '4byte',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token metadata cache to avoid repeated RPC calls
CREATE TABLE IF NOT EXISTS token_metadata (
    chain           VARCHAR(20) NOT NULL,
    address         VARCHAR(42) NOT NULL,
    symbol          VARCHAR(50) NOT NULL,
    name            VARCHAR(200),
    decimals        SMALLINT NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chain, address)
);
