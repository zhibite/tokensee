# 实体地址库扩展方案

> 当前规模：~120 万条（2026-03）
> 目标：支撑千万甚至过亿地址的存储与查询

---

## 规模阶段分析

| 数量级 | 典型来源 | 状态 |
|---|---|---|
| 10 万 | 高质量标签（交易所/协议/黑客） | ✅ 已有 |
| 100 万 | onchain-scan、ENS-bulk | ✅ 已完成 |
| 1000 万 | ERC-20 转账地址全量 | 下一步 |
| 1 亿+ | 所有链活跃钱包 | 终态 |

---

## 核心挑战

查询性能是首要瓶颈，不是存储容量。WhaleMonitor 每次检测到 alert 需要对 from/to 两个地址做实体 lookup，如果 99% 的地址根本不在库里（无标签活跃地址），每次都走 DB 是巨大浪费。

---

## 方案一：PostgreSQL 分区表（适合 1000 万量级）

PostgreSQL 本身能支撑 1 亿行，关键是让索引尺寸可控。

```sql
-- 按链做 LIST 分区（7 个分区，每个分区的索引更小，能放进内存）
CREATE TABLE entities (
  id           BIGSERIAL,
  address      CHAR(42)    NOT NULL,
  chain        VARCHAR(20) NOT NULL,
  label        VARCHAR(120) NOT NULL,
  entity_name  VARCHAR(80)  NOT NULL,
  entity_type  VARCHAR(30)  NOT NULL,
  confidence   VARCHAR(10)  NOT NULL DEFAULT 'high',
  source       VARCHAR(30)  NOT NULL DEFAULT 'manual',
  tags         TEXT[]       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY LIST (chain);

CREATE TABLE entities_ethereum  PARTITION OF entities FOR VALUES IN ('ethereum');
CREATE TABLE entities_bsc       PARTITION OF entities FOR VALUES IN ('bsc');
CREATE TABLE entities_arbitrum  PARTITION OF entities FOR VALUES IN ('arbitrum');
CREATE TABLE entities_polygon   PARTITION OF entities FOR VALUES IN ('polygon');
CREATE TABLE entities_base      PARTITION OF entities FOR VALUES IN ('base');
CREATE TABLE entities_optimism  PARTITION OF entities FOR VALUES IN ('optimism');
CREATE TABLE entities_avalanche PARTITION OF entities FOR VALUES IN ('avalanche');
```

**优点**：零代码改动，分区索引更小
**瓶颈**：超过 5000 万行后 B-tree 索引仍会很大

---

## 方案二：Bloom Filter + Redis 两级缓存（关键优化，优先级高）

**核心思路**：大多数地址根本不在库里，用 Bloom Filter 在内存中快速排除，避免无效 DB 查询。

```
Bloom Filter（内存，~120MB）→ 快速排除未知地址（纳秒级）
      ↓ 可能存在
Redis Hash（热数据缓存，微秒级）
      ↓ miss
PostgreSQL（持久存储，毫秒级）
```

```typescript
async lookup(address: string, chain: string): Promise<Entity | null> {
  // 第一步：Bloom filter（纳秒级，~120MB 内存覆盖 1 亿地址）
  if (!bloomFilter.test(`${address}:${chain}`)) return null;

  // 第二步：Redis（微秒级）
  const cached = await redis.hget(`entity:${address}`, chain);
  if (cached) return JSON.parse(cached);

  // 第三步：PostgreSQL（毫秒级）
  const row = await db.query(...);
  if (row) await redis.hset(`entity:${address}`, chain, JSON.stringify(row));
  return row;
}
```

**Bloom Filter 参数**（1 亿地址，1% 误报率）：
- 内存：~120 MB
- 查询时间：< 1 μs
- 误报（false positive）只是多查一次 Redis/DB，不影响正确性，不会产生错误标签
- 推荐库：`bloom-filters`（npm）

**实施步骤**：
1. 启动时从 PostgreSQL 全量加载地址到 Bloom Filter（约 30 秒）
2. 每次新增地址时同步更新 Filter
3. Filter 序列化持久化到 Redis，避免重启重建

---

## 方案三：数据分层（最重要的架构决策）

不是所有地址都需要同等对待，按质量分层存储：

```
Tier 1 — 精标签层（~10 万）
  来源：manual、exchange、protocol、ofac、ens
  存储：PostgreSQL + 全量 Redis 预热
  查询：全部命中 Redis，零 DB 访问
  代表：Binance Hot Wallet、Uniswap V3 Router 等

Tier 2 — 社区标签层（~100 万）
  来源：github-labels、forta、scamsniffer、sybil、rotki
  存储：PostgreSQL + LRU Redis 缓存
  查询：热点地址走 Redis，冷地址查 DB

Tier 3 — 活跃地址层（~1 亿）
  来源：onchain-scan、ENS-bulk
  存储：独立精简表 active_addresses，只存 address + chain + type
  查询：只走 Bloom Filter + PostgreSQL，不走 Redis
  意义：标记"这个地址活跃过"，即使没有具体名称
```

Tier 3 专用表设计（极简，节省 50%+ 空间）：

```sql
-- 地址用 BYTEA 存二进制（20字节 vs CHAR(42) 的 42字节）
-- chain 用 SMALLINT 枚举（1=eth, 2=bsc, 3=arb...）
CREATE TABLE active_addresses (
  address   BYTEA    NOT NULL,
  chain     SMALLINT NOT NULL,
  type      VARCHAR(20) NOT NULL DEFAULT 'unknown',
  first_seen INT NOT NULL,  -- Unix timestamp
  PRIMARY KEY (address, chain)
) PARTITION BY HASH (address);  -- 哈希分区，均匀分布

-- 16 个哈希分区，每个约 600 万行（1 亿总量）
CREATE TABLE active_addresses_0 PARTITION OF active_addresses
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... 以此类推
```

---

## 方案四：地址二进制化（存储节省 52%）

当前 `CHAR(42)` 存 `0x1234...abcd`（42 字节），改成 `BYTEA(20)`：

```
1 亿行 × CHAR(42)  = 4.2 GB（仅地址列）
1 亿行 × BYTEA(20) = 2.0 GB  → 节省 52%
连带减少索引大小、内存占用、IO 压力
```

应用层转换：

```typescript
const addrToBytes = (addr: string): Buffer =>
  Buffer.from(addr.replace('0x', ''), 'hex');

const bytesToAddr = (buf: Buffer): string =>
  '0x' + buf.toString('hex');
```

---

## 方案五：分析型查询引入 ClickHouse（聚合/统计场景）

当需要做地址库的统计分析（按来源统计、按类型聚合、时序趋势）时，PostgreSQL 的 OLAP 性能会成瓶颈。

- **PostgreSQL**：保持为写入主库和精确 lookup
- **ClickHouse**：接收 CDC（变更数据捕获）同步，负责所有聚合查询
- 列式存储对亿级行的 `GROUP BY` 查询比 PostgreSQL 快 10-100x

---

## 方案六：图数据库（关系分析场景）

做资金链追踪、聚类归因时，关系型数据库的多跳 JOIN 会遇到性能墙：

| 场景 | PostgreSQL | Neo4j |
|---|---|---|
| 地址 → 实体 lookup | ✅ 快 | 一般 |
| 同属一个实体的所有地址 | 尚可 | ✅ 快 |
| 3 跳关系（资金流向追踪） | ❌ 慢 | ✅ 原生支持 |
| 聚类分析（CEX 归因） | ❌ 很慢 | ✅ 图算法 |

路径：**PostgreSQL 做主存储 + Neo4j 做关系分析**，对 whale_alerts 双写。

---

## 推荐路线图

```
现在（120 万）
  └─ 现有架构即可
  └─ 【优先】加 Bloom Filter：减少 WhaleMonitor 无效 DB 查询

→ 1000 万
  └─ PostgreSQL 按 chain LIST 分区
  └─ Redis 预热 Tier 1 全量（~10 万条，< 100 MB）
  └─ 独立 active_addresses 表承接 onchain-scan 数据

→ 5000 万
  └─ 数据分层正式落地（entities / active_addresses 分离）
  └─ 地址二进制化（BYTEA 替换 CHAR(42)）
  └─ ClickHouse 承接统计分析查询

→ 过亿 + 关系分析
  └─ Neo4j 补充图查询（资金追踪、聚类归因）
  └─ Bloom Filter 升级为 Cuckoo Filter（支持删除操作）
```

---

## 最优先落地项

**Bloom Filter**，原因：
- 成本低：一个 npm 包 + ~100 行代码
- 收益高：当前 120 万条中绝大多数地址是"无标签活跃地址"（onchain-scan），WhaleMonitor 每次 lookup 都会 miss，Bloom Filter 能在纳秒内返回 null，完全省去 Redis + DB 的两次网络往返
- 随着地址库扩大，效果越来越明显
