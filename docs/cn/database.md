# 数据库设计

TokenSee 使用 **PostgreSQL 16** 作为持久化存储，**Redis 7** 用于缓存。运行 `docker-compose up -d` 即可启动两者。

迁移文件由 `npm run migrate` 按顺序执行（调用 `scripts/migrate.ts`）。

---

## 数据表

### `transactions` — 交易记录

存储所有已成功解码的交易。每次调用 `POST /v1/tx/decode` 后异步写入（非阻塞）。

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

    -- 语义化解码数据
    tx_type         VARCHAR(30),         -- 如 'swap'、'transfer'
    protocol_id     VARCHAR(50),         -- 如 'uniswap-v3'
    summary         TEXT,                -- 人类可读的一句话摘要
    function_name   VARCHAR(200),        -- 如 'exactInputSingle'
    decode_method   VARCHAR(20),         -- 'known_abi' | 'four_byte' | 'event_only' | 'raw'

    -- 资产流向（可变长度，使用 JSONB）
    assets_in       JSONB NOT NULL DEFAULT '[]',
    assets_out      JSONB NOT NULL DEFAULT '[]',

    -- Gas 与费用
    gas_used        BIGINT,
    gas_price_wei   NUMERIC(30,0),
    fee_usd         NUMERIC(18,6),

    -- 原始数据
    raw_input       TEXT,
    function_args   JSONB,
    decoded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(hash, chain)
);
```

**索引**

| 索引名 | 字段 | 用途 |
|---|---|---|
| `idx_tx_chain_hash` | `(chain, hash)` | 按交易哈希主键查询 |
| `idx_tx_sender` | `(sender, chain)` | Activity 记录流查询 |
| `idx_tx_protocol` | `(protocol_id)` 部分索引 | 按协议过滤 |
| `idx_tx_timestamp` | `(block_timestamp DESC)` | 时间倒序分页 |
| `idx_tx_type` | `(tx_type)` 部分索引 | 按交易类型过滤 |

**`assets_in` / `assets_out` JSONB 结构**

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

### `entities` — 地址实体标签库

将链上地址映射到真实机构。由 EntityService 静态预置并按需扩展。

```sql
CREATE TABLE entities (
  id           SERIAL PRIMARY KEY,
  address      CHAR(42)     NOT NULL,
  chain        VARCHAR(20)  NOT NULL DEFAULT 'multi',
  label        VARCHAR(120) NOT NULL,   -- "Binance Hot Wallet 14"
  entity_name  VARCHAR(80)  NOT NULL,   -- "Binance"
  entity_type  VARCHAR(30)  NOT NULL,   -- 见下方 CHECK 约束
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

**索引**

| 索引名 | 字段 | 用途 |
|---|---|---|
| `entities_address_chain_idx`（唯一） | `(address, chain)` | 按地址快速查询 |
| `entities_entity_name_idx` | `(entity_name)` | 按机构名搜索 |
| `entities_entity_type_idx` | `(entity_type)` | 按类型过滤 |

**预置实体覆盖范围（70+ 条）**

| 分类 | 包含机构 |
|---|---|
| 中心化交易所 | Binance（10 个钱包）、Coinbase（7 个）、OKX（4 个）、Kraken（4 个）、Bybit、Bitfinex、HTX、Gate.io |
| DeFi 协议 | Uniswap V2/V3/Universal、Aave V3、Compound、Curve、1inch、Balancer、Lido |
| 跨链桥 | Arbitrum、Optimism、Polygon、Base、Wormhole |
| 稳定币 | USDC、USDT、DAI、BUSD |
| 预言机 | Chainlink |
| 基金/风投 | a16z、Paradigm、Jump Trading |
| DAO | Uniswap DAO Treasury |
| 混币器 | Tornado Cash |
| BSC 协议 | PancakeSwap V2/V3 |

---

### `whale_alerts` — 巨鲸预警记录

由 `WhaleMonitor` 后台 Worker 检测并写入的大额转账记录。

```sql
CREATE TABLE whale_alerts (
  id             BIGSERIAL   PRIMARY KEY,
  tx_hash        CHAR(66)    NOT NULL,
  chain          VARCHAR(20) NOT NULL,
  block_number   BIGINT      NOT NULL,
  timestamp      BIGINT      NOT NULL,          -- Unix 时间戳（秒）

  from_address   CHAR(42)    NOT NULL,
  from_label     VARCHAR(120),                  -- NULL 表示未知地址
  from_entity    VARCHAR(80),
  from_type      VARCHAR(30),

  to_address     CHAR(42)    NOT NULL,
  to_label       VARCHAR(120),
  to_entity      VARCHAR(80),
  to_type        VARCHAR(30),

  asset_address  CHAR(42)    NOT NULL,          -- 原生代币用 0x0...0
  asset_symbol   VARCHAR(20) NOT NULL,
  amount         NUMERIC(36, 8) NOT NULL,       -- 人类可读数量
  amount_usd     NUMERIC(20, 2),               -- NULL 表示价格未知

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

**索引**

| 索引名 | 字段 | 用途 |
|---|---|---|
| `whale_alerts_tx_asset_idx`（唯一） | `(tx_hash, asset_address)` | 重扫去重 |
| `whale_alerts_chain_ts_idx` | `(chain, timestamp DESC)` | 预警流查询 |
| `whale_alerts_from_idx` | `(from_address)` | 按发送方查询 |
| `whale_alerts_to_idx` | `(to_address)` | 按接收方查询 |
| `whale_alerts_alert_type_idx` | `(alert_type)` | 按类型过滤 |
| `whale_alerts_amount_usd_idx` | `(amount_usd DESC)` | 按金额排序 |

---

### 其他表

| 表名 | 迁移文件 | 说明 |
|---|---|---|
| `protocols` | 002 | 已知协议注册表，存储链上元数据，目前手动维护 |
| `abi_cache` | 003 | 缓存从 4byte.directory 查询到的 ABI 片段，避免重复 HTTP 请求 |
| `api_keys` | 004 | API 密钥管理，密钥以 SHA-256 + `API_KEY_SALT` 哈希后存储 |

---

## 执行迁移

```bash
npm run migrate          # 按顺序执行所有待执行的迁移文件
```

迁移文件路径：`migrations/001_*.sql` → `006_*.sql`

执行脚本（`scripts/migrate.ts`）按字母序读取文件，天然幂等——所有 `CREATE TABLE` 均使用 `IF NOT EXISTS`。
