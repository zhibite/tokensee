# TokenSee 项目概览

> **隐形基础设施** — 让 DApp 开发者像调用 Web2 REST API 一样使用链上数据。

TokenSee 是一个区块链数据中间件层，屏蔽了多链开发的底层复杂性。开发者无需自行处理 RPC 调用、ABI 解析、价格聚合——直接获得语义化的结构化 JSON，就像调用任何普通 REST API 一样。

---

## 一、技术栈

### 后端

| 类别 | 技术选型 | 说明 |
|---|---|---|
| **运行时** | Node.js ≥ 20 + TypeScript | 强类型保障，ESM 模块 |
| **Web 框架** | Express.js | 轻量 REST API |
| **以太坊交互** | Viem 2.x | 现代化的以太坊库，比 ethers.js 轻量 90% |
| **数据库** | PostgreSQL 16 | 实体库、预警记录、活动历史存储 |
| **缓存** | Redis 7 | 解码结果、实体标签、价格数据缓存 |
| **数据校验** | Zod | 运行时 Schema 校验 |
| **HTTP 客户端** | Axios | 外部 API 调用（CoinGecko、Etherscan 等） |
| **布隆过滤器** | bloom-filters | 地址去重过滤，减少重复预警 |
| **开发工具** | tsx | TypeScript 直接执行，热重载 |
| **测试** | Vitest | 单元测试框架 |

### 前端

| 类别 | 技术选型 | 说明 |
|---|---|---|
| **框架** | Next.js 15 (App Router) | SSR + CSR 混合渲染 |
| **语言** | React 19 + TypeScript | 现代化 React |
| **样式** | Tailwind CSS 4.x | 原子化 CSS，快速构建 UI |
| **构建工具** | Next.js 内置 Turbopack | 极快的开发启动和 HMR |

### 基础设施

| 类别 | 技术选型 | 说明 |
|---|---|---|
| **容器化** | Docker + Docker Compose | 一键启动 PostgreSQL + Redis |
| **RPC 节点** | Alchemy + Ankr + QuickNode | 多链节点，按成本优化分配 |
| **数据源** | 20+ 外部 API | 覆盖地址标签、价格、协议数据 |

---

## 二、支持的区块链

| 链 | Chain ID | 代币 | 区块时间 | RPC 策略 |
|---|---|---|---|---|
| Ethereum | 1 | ETH | 12s | Alchemy（主）+ QuickNode（备） |
| BNB Smart Chain | 56 | BNB | 3s | Ankr / QuickNode |
| Arbitrum | 42161 | ETH | 1s | Ankr（主）+ 公共 RPC |
| Polygon | 137 | MATIC | 2s | Ankr（主）+ LlamaRPC |
| Base | 8453 | ETH | 2s | Ankr（主）+ 公共 RPC |
| Optimism | 10 | ETH | 2s | Ankr（主）+ 公共 RPC |
| Avalanche C-Chain | 43114 | AVAX | 2s | 公共 RPC |

---

## 三、核心功能

### 1. 交易语义解码

将链上原始交易解码为人类可读的摘要、资产流向和 USD 估值。

**解码流水线（三层策略）：**

```
┌─────────────────────────────────────────────────────────┐
│ 第 1 层：本地 ABI Registry（0ms 延迟）                    │
│   - 内存 Map 存储 Uniswap、Aave、Curve 等 30+ 协议 ABI     │
│   - 函数选择器 → 方法名 → 参数解析                        │
├─────────────────────────────────────────────────────────┤
│ 第 2 层：4byte.directory（~100ms 网络开销）               │
│   - 未知函数选择器 → 自动查询全球最大签名库               │
│   - 命中后缓存 Redis                                     │
├─────────────────────────────────────────────────────────┤
│ 第 3 层：纯事件日志推断（兜底）                           │
│   - Transfer / Swap / Approval 事件 → 资产流向          │
│   - 无 calldata 时仍可还原基础交易信息                    │
└─────────────────────────────────────────────────────────┘
```

**额外能力：**

- **内部转账追踪**：通过 `debug_traceTransaction` callTracer 追踪合约内部 ETH 转移（闪电贷、多跳路由）
- **MEV 行为识别**：自动标注 `flashloan` / `arbitrage` / `sandwich_bot`
- **USD 实时估值**：每笔资产变化附带当时价格
- **历史价格查询**：`GET /v1/price/history` 按区块时间戳查询

### 2. 地址实体库

内置 70,000+ 链上地址实体标注，支持三层查询：

| 层级 | 数据源 | 延迟 | 覆盖范围 |
|---|---|---|---|
| 内存 Map | 静态实体数据 | 0ms | 70+ 知名地址（Binance、Coinbase、Uniswap 等） |
| Redis 缓存 | 历史查询结果 | ~1ms | 近期查询过的地址 |
| PostgreSQL | 完整数据库 | ~5ms | 70,000+ 全量实体 |

**实体分类：**

- 中心化交易所（Binance 10 个、Coinbase 7 个、OKX、Kraken、Bybit 等）
- DeFi 协议（Uniswap、Aave、Curve、Compound、PancakeSwap 等）
- 跨链桥（Arbitrum、Optimism、Polygon、Base、Wormhole）
- 稳定币合约（USDC、USDT、DAI、BUSD）
- 风险地址（Tornado Cash 等混币器）
- VC/基金（a16z、Paradigm、Jump Trading）
- Smart Money（14 个策展钱包：VC / 量化 / 做市商 / 巨鲸）

### 3. 巨鲸预警监控

后台 Worker 主动扫描 7 条链的新区块，标记 ≥ $100,000 USD 的大额转账。

| 链 | 扫描间隔 | 监控代币 |
|---|---|---|
| Ethereum | 30s | ETH + WETH + USDC + USDT + DAI + WBTC |
| BSC | 15s | BNB + BETH + BUSD + USDT + USDC |
| Arbitrum / Polygon / Base / Optimism | 45s（错峰） | ETH + WETH + USDC + USDT |
| Avalanche | 60s | AVAX + USDC + USDT + WAVAX |

**预警类型分类：**

- `exchange_inflow` — 任意地址 → 已知交易所
- `exchange_outflow` — 已知交易所 → 任意地址
- `bridge_deposit` — 任意地址 → 已知跨链桥
- `bridge_withdrawal` — 已知跨链桥 → 任意地址
- `whale_movement` — 已知基金/巨鲸互转
- `large_transfer` — 未知地址大额转移

### 4. 持仓查询

查询任意地址在 7 条链上的代币余额及 USD 估值。

- 原生代币（ETH / BNB / MATIC / AVAX 等）
- 主流 ERC-20 代币
- 自动按区块时间戳获取历史价格
- 多链合并 USD 总价值

### 5. 活动历史记录

任意地址的语义化交易历史，支持：

- 多链合并展示
- 游标分页
- 按链/类型/金额过滤
- 交易对手方实体标注

### 6. 自定义告警规则引擎

用户可创建精准的告警规则，当预警满足条件时自动推送。

```json
// 示例规则：以太坊上 USDC 大额流入交易所（≥$500K）
{
  "name": "ETH USDC 大额入所",
  "conditions": {
    "chains":        ["ethereum"],
    "asset_symbols": ["USDC"],
    "alert_types":   ["exchange_inflow"],
    "min_usd":       500000
  },
  "webhook_id": "wh_xxxx"
}
```

支持条件维度：链、资产类型、预警类型、最小/最大金额、特定地址。

### 7. 实时推送通道

| 通道 | 协议 | 用途 |
|---|---|---|
| SSE 流 | `GET /v1/alerts/stream` | 前端实时大屏，零延迟推送 |
| Webhook | HTTP POST | 后端系统集成，HMAC-SHA256 签名验证 |

### 8. 资金流图谱

基于历史 whale_alerts 自动构建地址一跳资金流关系图。

- 后端聚合图结构（节点+边+体量）
- 前端纯 SVG + JS spring-force 渲染（无外部图表依赖）
- 节点颜色按实体类型区分
- 边宽度正比于资金体量

### 9. Smart Money 追踪

策展 14 个顶级 VC / 做市商 / 巨鲸钱包，实时呈现其大额链上行为。

- 前端 Feed 页面（按类别/链过滤）
- API 接口获取活动历史和钱包列表
- 平替 Nansen Smart Money 付费功能

---

## 四、项目架构

```
tokensee/
├── src/                           # 后端（Node.js + TypeScript）
│   ├── api/
│   │   ├── server.ts              # Express 应用工厂
│   │   └── routes/
│   │       ├── tx.routes.ts       # POST /v1/tx/decode — 交易解码
│   │       ├── account.routes.ts   # GET /v1/account/:addr/portfolio|activity
│   │       ├── address.routes.ts   # GET /v1/address/:addr/entity|graph|ens
│   │       ├── alert.routes.ts     # GET /v1/alerts|stats, /v1/alerts/stream
│   │       ├── alert-rules.routes.ts  # /v1/alert-rules CRUD
│   │       ├── webhook.routes.ts   # /v1/webhooks CRUD
│   │       ├── entity.routes.ts    # /v1/entity/:name/wallets
│   │       ├── smart-money.routes.ts  # /v1/smart-money/*
│   │       ├── price.routes.ts     # /v1/price/current|history
│   │       └── health.routes.ts   # /health
│   ├── decoder/
│   │   ├── pipeline/               # DecodePipeline + 流水线步骤
│   │   │   ├── DecodePipeline.ts   # 流水线编排器
│   │   │   ├── steps/
│   │   │   │   ├── Basic.step.ts      # 基础信息（from/to/value/gas）
│   │   │   │   ├── Trace.step.ts      # 内部转账追踪
│   │   │   │   ├── Semantic.step.ts   # 协议语义构建
│   │   │   │   └── MevDetect.step.ts  # MEV 行为识别
│   │   ├── abi/
│   │   │   └── AbiRegistry.ts      # 三层 ABI 查找（本地/4byte/事件推断）
│   │   ├── protocols/              # 已知合约地址映射
│   │   │   └── index.ts
│   │   └── semantic/               # 协议语义处理器
│   │       ├── types.ts
│   │       ├── SemanticRegistry.ts
│   │       ├── uniswap.handler.ts
│   │       ├── aave.handler.ts
│   │       ├── curve.handler.ts
│   │       ├── gmx.handler.ts
│   │       ├── pendle.handler.ts
│   │       └── eigenlayer.handler.ts
│   ├── services/
│   │   ├── entity/
│   │   │   ├── EntityService.ts    # 实体查询服务（三层查询）
│   │   │   ├── entities.ts         # 静态实体种子数据
│   │   │   └── smartMoney.ts       # Smart Money 钱包列表
│   │   ├── monitor/
│   │   │   ├── WhaleMonitor.ts     # 链上 Worker 入口
│   │   │   ├── ChainScanner.ts     # 单链扫描器（带暂停/恢复）
│   │   │   └── BloomFilter.ts      # 地址去重
│   │   ├── portfolio/
│   │   │   └── PortfolioService.ts # 余额查询 + USD 估值
│   │   ├── price/
│   │   │   └── PriceService.ts     # 价格获取（CoinGecko / 链上）
│   │   ├── rpc/
│   │   │   └── RpcManager.ts       # 多链 RPC 客户端（主备容错）
│   │   ├── cache/
│   │   │   └── CacheService.ts     # Redis 缓存工具
│   │   ├── webhook/
│   │   │   ├── WebhookService.ts   # Webhook 推送服务
│   │   │   ├── WebhookUrlPolicy.ts # URL 策略（频率限制/幂等）
│   │   │   └── alertQueue.ts       # 预警投递队列
│   │   └── db/
│   │       ├── index.ts            # PostgreSQL 连接池
│   │       └── queries/            # SQL 查询模板
│   ├── config/
│   │   ├── index.ts                # env.ts 合并导出
│   │   ├── chains.config.ts        # 链配置（ChainConfig）
│   │   └── constants.ts            # 全局常量
│   ├── types/
│   │   ├── chain.types.ts          # 链类型定义
│   │   ├── transaction.types.ts    # 交易类型定义
│   │   ├── entity.types.ts         # 实体类型定义
│   │   └── alert.types.ts          # 预警类型定义
│   └── index.ts                    # 服务入口（API + Worker 启动）
├── web/                            # 前端（Next.js 15 App Router）
│   └── src/
│       ├── app/                    # 页面路由
│       │   ├── layout.tsx          # 根布局
│       │   ├── page.tsx            # 落地页
│       │   ├── globals.css         # 全局样式
│       │   ├── dashboard/          # Dashboard 页面
│       │   ├── address/[addr]/     # 地址详情页（Portfolio/Activity/FundFlow 三 Tab）
│       │   ├── alerts/             # 巨鲸预警页面
│       │   ├── smart-money/        # Smart Money 页面
│       │   ├── intelligence/        # 链上统计页面
│       │   └── docs/               # API 文档 + Playground
│       ├── components/
│       │   ├── AlertFeed.tsx       # 预警列表组件
│       │   ├── EntityBadge.tsx     # 实体标签组件
│       │   ├── ChainBadge.tsx      # 链徽章组件
│       │   ├── FundFlowGraph.tsx   # 资金流图谱（SVG 渲染）
│       │   ├── AlertStream.tsx     # SSE 实时流组件
│       │   └── ...
│       └── lib/
│           ├── api.ts              # API 调用封装
│           ├── types.ts            # 共享类型
│           └── utils.ts            # 工具函数
├── migrations/                      # SQL 迁移文件
├── scripts/                         # 运维脚本
│   ├── migrate.ts                   # 数据库迁移执行器
│   ├── fetch-*.ts                   # 外部数据导入（20+ 个来源）
│   └── enrich-*.ts                  # 数据质量提升脚本
├── docker-compose.yml               # PostgreSQL + Redis
├── package.json                     # 后端依赖
├── tsconfig.json                   # TypeScript 配置
└── docs/                            # 项目文档
    └── cn/                          # 中文文档
        ├── README.md                # 项目介绍（重定向）
        ├── overview.md              # 本文档：技术栈 + 功能概览
        ├── product.md               # 产品定位与核心卖点
        ├── api-reference.md         # REST API 完整参考
        ├── database.md               # 数据库设计
        ├── development.md            # 开发指南
        └── entity-library-sources.md # 实体库数据来源
```

---

## 五、核心 API 一览

| 接口 | 方法 | 说明 |
|---|---|---|
| `/v1/tx/decode` | POST | 交易语义解码（7 条链） |
| `/v1/account/:addr/portfolio` | GET | 多链持仓查询 + USD 估值 |
| `/v1/account/:addr/activity` | GET | 地址历史交易记录（游标分页） |
| `/v1/address/:addr/entity` | GET | 地址实体标签查询 |
| `/v1/address/:addr/ens` | GET | ENS 反向解析 |
| `/v1/address/:addr/graph` | GET | 资金流图谱（节点+边+体量） |
| `/v1/entity/:name/wallets` | GET | 机构钱包聚类 |
| `/v1/smart-money/activity` | GET | Smart Money 动向 |
| `/v1/smart-money/wallets` | GET | Smart Money 钱包列表 |
| `/v1/alerts` | GET | 历史巨鲸预警（支持过滤） |
| `/v1/alerts/stream` | GET | SSE 实时流 |
| `/v1/alert-rules` | GET/POST | 自定义告警规则 CRUD |
| `/v1/alert-rules/:id` | PATCH/DELETE | 启用/禁用/删除规则 |
| `/v1/webhooks` | GET/POST | Webhook CRUD |
| `/v1/webhooks/:id/logs` | GET | Webhook 投递记录 |
| `/v1/price/current` | GET | 批量当前价格 |
| `/v1/price/history` | GET | 历史日级价格 |
| `/v1/stats` | GET | 链上活动聚合统计 |
| `/health` | GET | 健康检查 |

---

## 六、数据来源

实体库数据来自 20+ 外部来源，通过 `scripts/fetch-*.ts` 脚本持续导入：

| 来源 | 内容 |
|---|---|
| Etherscan Labels API | 合约标签 |
| CoinGecko | 代币元数据 |
| DeFi Llama | 协议 TVL / 池子数据 |
| DeBank | 钱包持仓数据 |
| Arkham Intelligence | 实体图谱 |
| Dune Analytics | 链上数据聚合 |
| GoPlus Security | 安全评分 |
| OpenZeppelin Defender | Forta 机器人标签 |
| Sybil | GitHub 贡献者地址 |
| GitHub API | 开源协议贡献者 |
| ENS | ENS 域名 |
| Rotki | ETH 列表 |
| Trust Wallet | 代币列表 |
| Snapshot | DAO 投票者 |
| EigenLayer API | 再质押数据 |
| 官方合约 | 各协议官方文档 |

---

## 七、运行要求

- Node.js ≥ 20
- Docker + Docker Compose
- PostgreSQL 16
- Redis 7
- API 密钥：Alchemy（ETH 主网）

详细配置请参考 [开发指南](./development.md)。
