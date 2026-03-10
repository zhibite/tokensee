# Database Schema

TokenSee uses **PostgreSQL 16** for persistent storage and **Redis 7** for caching. Run `docker-compose up -d` to start both.

Migrations are applied in order by `npm run migrate` (runs `scripts/migrate.ts`).

---

## Tables

### `transactions`

Stores every successfully decoded transaction. Written asynchronously (non-blocking) after each `POST /v1/tx/decode` call.

```sql
CREATE TABLE transactions (
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
    tx_type         VARCHAR(30),         -- e.g. 'swap', 'transfer'
    protocol_id     VARCHAR(50),         -- e.g. 'uniswap-v3'
    summary         TEXT,                -- human-readable sentence
    function_name   VARCHAR(200),        -- e.g. 'exactInputSingle'
    decode_method   VARCHAR(20),         -- 'known_abi' | 'four_byte' | 'event_only' | 'raw'

    -- Asset flows (variable-length)
    assets_in       JSONB NOT NULL DEFAULT '[]',
    assets_out      JSONB NOT NULL DEFAULT '[]',

    -- Gas
    gas_used        BIGINT,
    gas_price_wei   NUMERIC(30,0),
    fee_usd         NUMERIC(18,6),

    -- Raw
    raw_input       TEXT,
    function_args   JSONB,
    decoded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(hash, chain)
);
```

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `idx_tx_chain_hash` | `(chain, hash)` | Primary lookup by tx hash |
| `idx_tx_sender` | `(sender, chain)` | Activity feed queries |
| `idx_tx_protocol` | `(protocol_id)` | Filter by protocol (partial) |
| `idx_tx_timestamp` | `(block_timestamp DESC)` | Time-sorted pagination |
| `idx_tx_type` | `(tx_type)` | Filter by tx type (partial) |

**`assets_in` / `assets_out` JSON shape**

```json
[
  {
    "symbol": "USDC",
    "address": "0xa0b8...ec18",
    "amount": "3200.00",
    "amount_usd": "3200.00",
    "decimals": 6
  }
]
```

---

### `entities`

Address entity label library. Maps on-chain addresses to real-world organisations.

```sql
CREATE TABLE entities (
  id           SERIAL PRIMARY KEY,
  address      CHAR(42)    NOT NULL,
  chain        VARCHAR(20) NOT NULL DEFAULT 'multi',
  label        VARCHAR(120) NOT NULL,   -- "Binance Hot Wallet 14"
  entity_name  VARCHAR(80)  NOT NULL,   -- "Binance"
  entity_type  VARCHAR(30)  NOT NULL,   -- see CHECK below
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
```

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `entities_address_chain_idx` (UNIQUE) | `(address, chain)` | Fast lookup by address |
| `entities_entity_name_idx` | `(entity_name)` | Search by organisation |
| `entities_entity_type_idx` | `(entity_type)` | Filter by type |

**Pre-seeded entities (70+)**

| Category | Examples |
|---|---|
| Exchanges | Binance (10 wallets), Coinbase (7), OKX (4), Kraken (4), Bybit, Bitfinex, HTX, Gate.io |
| Protocols | Uniswap V2/V3/Universal, Aave V3, Compound, Curve, 1inch, Balancer, Lido |
| Bridges | Arbitrum, Optimism, Polygon, Base, Wormhole |
| Stablecoins | USDC, USDT, DAI, BUSD |
| Oracles | Chainlink |
| Funds / VCs | a16z, Paradigm, Jump Trading |
| DAOs | Uniswap DAO Treasury |
| Mixers | Tornado Cash |
| BSC | PancakeSwap V2/V3 |

---

### `whale_alerts`

Records of large transfers detected by the `WhaleMonitor` background worker.

```sql
CREATE TABLE whale_alerts (
  id             BIGSERIAL   PRIMARY KEY,
  tx_hash        CHAR(66)    NOT NULL,
  chain          VARCHAR(20) NOT NULL,
  block_number   BIGINT      NOT NULL,
  timestamp      BIGINT      NOT NULL,          -- unix seconds

  from_address   CHAR(42)    NOT NULL,
  from_label     VARCHAR(120),                  -- NULL = unknown
  from_entity    VARCHAR(80),
  from_type      VARCHAR(30),

  to_address     CHAR(42)    NOT NULL,
  to_label       VARCHAR(120),
  to_entity      VARCHAR(80),
  to_type        VARCHAR(30),

  asset_address  CHAR(42)    NOT NULL,          -- 0x0...0 for native
  asset_symbol   VARCHAR(20) NOT NULL,
  amount         NUMERIC(36, 8) NOT NULL,
  amount_usd     NUMERIC(20, 2),

  alert_type     VARCHAR(30) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT whale_alerts_type_check CHECK (
    alert_type IN (
      'large_transfer', 'exchange_inflow', 'exchange_outflow',
      'whale_movement', 'bridge_deposit', 'bridge_withdrawal'
    )
  )
);
```

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `whale_alerts_tx_asset_idx` (UNIQUE) | `(tx_hash, asset_address)` | Dedup on re-scan |
| `whale_alerts_chain_ts_idx` | `(chain, timestamp DESC)` | Feed queries |
| `whale_alerts_from_idx` | `(from_address)` | Lookup by sender |
| `whale_alerts_to_idx` | `(to_address)` | Lookup by receiver |
| `whale_alerts_alert_type_idx` | `(alert_type)` | Filter by type |
| `whale_alerts_amount_usd_idx` | `(amount_usd DESC)` | Sort by size |

---

### `protocols` (migration 002)

Registry of known protocols with on-chain metadata. Currently populated manually.

### `abi_cache` (migration 003)

Caches ABI fragments resolved from 4byte.directory to avoid repeated HTTP calls.

### `api_keys` (migration 004)

API key management table. Keys are hashed with `API_KEY_SALT` using SHA-256 before storage.

---

## Running Migrations

```bash
npm run migrate          # applies all pending migrations in order
```

Migration files: `migrations/001_*.sql` → `006_*.sql`

The runner (`scripts/migrate.ts`) applies files in alphabetical order and is idempotent — all `CREATE TABLE` statements use `IF NOT EXISTS`.
