# TokenSee

> **隐形基础设施** — 让 DApp 开发者像调用 Web2 REST API 一样使用链上数据。

TokenSee 是一个区块链数据中间件层，屏蔽了多链开发的底层复杂性。开发者无需自行处理 RPC 调用、ABI 解析、价格聚合——直接获得语义化的结构化 JSON，就像调用任何普通 REST API 一样。

---

## 功能特性

| 功能 | 说明 |
|---|---|
| **交易解码** | 将任意 ETH / BSC 交易解码为人类可读的摘要、资产流向和 USD 估值 |
| **地址实体库** | 内置 70+ 知名链上地址（Binance、Coinbase、Uniswap、Aave 等）与真实机构的映射关系 |
| **巨鲸预警监控** | 后台 Worker 每 15–30 秒扫描新区块，标记 ≥ $10 万 USD 的大额转账，并分类为交易所入金/出金、跨链桥、巨鲸移仓等 |
| **持仓 API** | 查询任意地址在 ETH + BSC 上的代币余额及 USD 估值 |
| **Activity 记录流** | 任意地址的语义化交易历史，支持分页 |
| **多链支持** | 已支持以太坊主网 + BNB 智能链，可扩展更多链 |

---

## 快速开始

### 前置要求

- Node.js ≥ 20
- Docker + Docker Compose
- API 密钥：Alchemy（ETH）、QuickNode 或公共 RPC（BSC）

### 1. 配置环境变量

```bash
cp .env.example .env
# 填写：ALCHEMY_API_KEY、QUICKNODE_BSC_URL、DATABASE_URL、REDIS_URL、API_KEY_SALT
```

### 2. 启动基础设施

```bash
docker-compose up -d
# 启动 postgres:16（:5432）和 redis:7（:6379）
```

### 3. 执行数据库迁移

```bash
npm run migrate
```

### 4. 启动 API 服务

```bash
npm run dev          # 开发模式（tsx watch 热重载）
npm run build && npm start   # 生产模式
```

服务启动后监听 `http://localhost:3000`。

### 5. 启动前端（可选）

```bash
cd web
npm run dev          # http://localhost:3001（若端口占用则尝试 :3002）
```

---

## 项目结构

```
tokensee/
├── src/                        # 后端（Node.js + TypeScript）
│   ├── api/
│   │   ├── server.ts           # Express 应用工厂
│   │   └── routes/
│   │       ├── tx.routes.ts          # POST /v1/tx/decode
│   │       ├── account.routes.ts     # GET /v1/account/:addr/portfolio|activity
│   │       ├── address.routes.ts     # GET /v1/address/:addr/entity
│   │       └── alert.routes.ts       # GET /v1/alerts, /v1/alerts/stats
│   ├── decoder/
│   │   ├── pipeline/           # DecodePipeline + 4 个流水线步骤
│   │   ├── abi/                # AbiRegistry（三层 ABI 查找）
│   │   ├── protocols/          # 已知合约地址映射
│   │   └── semantic/           # 协议处理器（Uniswap、Aave 等）
│   ├── services/
│   │   ├── entity/             # EntityService + 静态实体种子数据
│   │   ├── monitor/            # WhaleMonitor 后台 Worker
│   │   ├── portfolio/          # PortfolioService（余额 + 价格）
│   │   ├── price/              # PriceService（CoinGecko / 链上价格）
│   │   ├── rpc/                # RpcManager（viem 客户端，多端点容错）
│   │   ├── cache/              # Redis 工具函数
│   │   └── db/                 # PostgreSQL 连接池 + 查询工具
│   ├── config/                 # chains.config.ts、env.ts
│   └── types/                  # 共享 TypeScript 类型定义
├── web/                        # 前端（Next.js 14 App Router）
│   └── src/
│       ├── app/                # 页面：/、/address/[addr]、/alerts、/docs
│       ├── components/         # UI 组件
│       └── lib/                # api.ts、types.ts、utils.ts
├── migrations/                 # SQL 迁移文件（按序执行）
├── scripts/                    # migrate.ts 执行脚本
├── docker-compose.yml
└── docs/                       # 项目文档
    ├── cn/                     # 中文文档（当前目录）
    └── ...                     # 英文文档
```

---

## 文档导航

| 文件 | 内容 |
|---|---|
| [architecture.md](./architecture.md) | 系统设计、数据流图、解码流水线详解 |
| [api-reference.md](./api-reference.md) | REST API 完整参考文档（含请求/响应示例） |
| [database.md](./database.md) | 数据库表结构、索引设计、实体类型说明 |
| [development.md](./development.md) | 开发环境搭建、环境变量、扩展新链/新协议 |
