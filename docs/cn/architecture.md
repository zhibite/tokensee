# 系统架构

## 整体设计

TokenSee 采用**分层中间件**模型。所有链特定的复杂度（RPC、ABI 解析、价格数据源）都封装在服务层内部，消费方通过统一的 REST 接口访问，无需关心底层是哪条链。

```
                   ┌────────────────────────────────────┐
                   │         前端（Next.js）             │
                   │  /、/address/[addr]、/alerts、/docs │
                   └──────────────┬─────────────────────┘
                                  │ HTTP
                   ┌──────────────▼─────────────────────┐
                   │          Express API 服务器          │
                   │  /v1/tx/decode                       │
                   │  /v1/account/:addr/portfolio|activity│
                   │  /v1/address/:addr/entity            │
                   │  /v1/alerts[/stats]                  │
                   └──────────────┬─────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─────────▼──────────┐  ┌────────▼────────┐  ┌──────────▼──────────┐
│   解码流水线        │  │  持仓服务       │  │   巨鲸监控           │
│ (POST /decode 触发) │  │ PortfolioService│  │  (后台 Worker)      │
└─────────┬──────────┘  └────────┬────────┘  └──────────┬──────────┘
          │                      │                       │
          │         ┌────────────┴───────────────────────┤
          │         │                                     │
┌─────────▼─────────▼───┐  ┌──────────────┐  ┌──────────▼──────────┐
│      RpcManager        │  │ 实体服务     │  │     价格服务         │
│  (viem + 多 RPC 容错)  │  │ 地址→实体标签│  │  (CoinGecko/链上)   │
└────────────────────────┘  └──────────────┘  └─────────────────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
             ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
             │  Redis     │ │PostgreSQL │ │ 4byte.dir  │
             │  （缓存）  │ │  （持久化）│ │ （ABI签名）│
             └────────────┘ └───────────┘ └────────────┘
```

---

## 解码流水线

`POST /v1/tx/decode` 的核心处理路径。四个顺序执行的步骤，每步都向共享的 `PipelineContext` 对象写入数据：

```
POST /v1/tx/decode { hash, chain }
  │
  ├─ 1. 参数校验（Zod）
  ├─ 2. Redis 缓存命中检查（完整结果，TTL 5 分钟）
  │
  └─ DecodePipeline.execute(hash, chain)
       │
       ├─ 步骤 1：FetchRawTxStep（获取原始交易）
       │     • viem.getTransaction() + getTransactionReceipt()
       │     • 结果写入 Redis 缓存（TTL 2 分钟）
       │
       ├─ 步骤 2：AbiDecodeStep（ABI 解码）
       │     三层 ABI 查找策略：
       │     a) 本地已知 ABI 注册表（Uniswap、Aave 等 JSON 文件）
       │     b) 4byte.directory HTTP 查询（函数选择器 → 函数签名）
       │     c) 仅日志回退（calldata 未知时，从事件日志推断）
       │
       ├─ 步骤 3：ProtocolIdentifyStep（协议识别）
       │     • 根据 to_address 在 known-addresses.ts 中查找 protocol_id
       │     • 覆盖范围：
       │       ETH — Uniswap V2/V3/Universal Router、Aave V3
       │       BSC — PancakeSwap V2/V3
       │
       └─ 步骤 4：SemanticStep（语义化）
             • 路由到对应协议处理器（UniswapV3Handler 等）
             • 输出：tx_type、summary、assets_in[]、assets_out[]、fee_usd
             • 通过 PriceService 获取资产 USD 价格
       │
  ├─ 实体增强（EntityService.lookup，并行查询 sender + contract）
  ├─ 缓存结果到 Redis（TTL 5 分钟）
  ├─ 异步持久化到 PostgreSQL（非阻塞，fire-and-forget）
  └─ 返回 JSON 响应
```

---

## 巨鲸监控（WhaleMonitor）

独立运行的单例后台 Worker，与 HTTP 请求完全解耦。

```
WhaleMonitor.start()
  ├─ setInterval(scanChain('ethereum'), 30_000ms)  ← 每 30 秒
  └─ setInterval(scanChain('bsc'),      15_000ms)  ← 每 15 秒

scanChain(chain)
  ├─ 通过 viem 获取最新区块号
  ├─ 扫描区间 [lastBlock+1 … latestBlock]
  │
  ├─ scanNativeTransfers()  — 原生代币大额转账
  │     • 获取区块范围内所有交易
  │     • 过滤：value_usd ≥ $100,000
  │     • buildAlert() → classifyAlert() → persistAlert()
  │
  └─ scanErc20Transfers()   — ERC-20 代币大额转账
        • 监听 ERC-20 Transfer 事件日志
        • 监控代币：
          ETH — WETH、USDC、USDT、DAI、WBTC、LINK、UNI
          BSC — WBNB、USDT、USDC、BUSD
        • 过滤：amount_usd ≥ $100,000
        • buildAlert() → classifyAlert() → persistAlert()

classifyAlert(fromType, toType) → AlertType（预警分类）
  • from 是交易所 → exchange_outflow（交易所出金）
  • to   是交易所 → exchange_inflow（交易所入金）
  • 涉及跨链桥   → bridge_deposit / bridge_withdrawal
  • 涉及基金/巨鲸→ whale_movement（巨鲸移仓）
  • 其他情况     → large_transfer（大额转账）

容错机制：连续 5 次 RPC 失败后，该链暂停扫描 10 分钟
```

---

## 实体服务（EntityService）

三层地址查询，延迟逐层递增：

```
entityService.lookup(address, chain)
  │
  ├─ 第一层：静态 Map（known-entities.ts 中的 ENTITY_MAP）
  │     约 0 ms — 70+ 预置知名地址，零延迟
  │
  ├─ 第二层：Redis 缓存
  │     约 1 ms — 曾经从数据库查询过的地址
  │
  └─ 第三层：PostgreSQL（entities 表）
        约 5 ms — 完整实体标签库
```

**实体类型：** `exchange`（交易所）、`protocol`（协议）、`bridge`（跨链桥）、`fund`（基金）、`whale`（巨鲸）、`mixer`（混币器）、`nft`、`stablecoin`（稳定币）、`oracle`（预言机）、`dao`、`other`

---

## 缓存策略

| 数据类型 | 缓存 Key | TTL |
|---|---|---|
| 完整解码结果 | `decode:{chain}:{hash}` | 5 分钟 |
| 原始交易数据 | `tx:{chain}:{hash}` | 2 分钟 |
| 交易回执 | `receipt:{chain}:{hash}` | 2 分钟 |
| 代币价格 | `price:{symbol}` | 60 秒 |
| 实体标签 | `entity:{chain}:{address}` | 24 小时 |

---

## 协议处理器

每个处理器负责：
- 识别具体调用的函数（如 `exactInputSingle`）
- 解析 ABI 解码后的参数
- 计算资产流向（进入/流出了什么）
- 为资产获取 USD 估值

| 处理器 | 覆盖协议 |
|---|---|
| `UniswapV3Handler` | Uniswap V3 SwapRouter、SwapRouter02、UniversalRouter |
| `UniswapV2Handler` | Uniswap V2 Router、PancakeSwap V2 Router |
| `GenericTransferHandler` | 原生 ETH/BNB 转账、ERC-20 Transfer 事件 |

**新增协议步骤：** 实现处理器接口 → 在 `known-addresses.ts` 注册合约地址 → 在 `SemanticStep` 路由中注册。
