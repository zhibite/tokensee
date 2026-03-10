-- Address entity label library
-- Stores known on-chain addresses mapped to real-world entities

CREATE TABLE IF NOT EXISTS entities (
  id           SERIAL PRIMARY KEY,
  address      CHAR(42)    NOT NULL,           -- lowercase 0x...
  chain        VARCHAR(20) NOT NULL DEFAULT 'multi', -- 'ethereum' | 'bsc' | 'multi'
  label        VARCHAR(120) NOT NULL,           -- e.g. "Binance Hot Wallet 14"
  entity_name  VARCHAR(80)  NOT NULL,           -- e.g. "Binance"
  entity_type  VARCHAR(30)  NOT NULL,           -- see CHECK below
  confidence   VARCHAR(10)  NOT NULL DEFAULT 'high',
  source       VARCHAR(30)  NOT NULL DEFAULT 'manual',
  tags         TEXT[]       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT entities_type_check CHECK (
    entity_type IN (
      'exchange', 'protocol', 'bridge', 'fund', 'whale',
      'mixer', 'nft', 'stablecoin', 'oracle', 'dao', 'other'
    )
  ),
  CONSTRAINT entities_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  )
);

-- One address can have multiple labels across chains
CREATE UNIQUE INDEX IF NOT EXISTS entities_address_chain_idx ON entities (address, chain);
CREATE INDEX IF NOT EXISTS entities_entity_name_idx ON entities (entity_name);
CREATE INDEX IF NOT EXISTS entities_entity_type_idx ON entities (entity_type);
