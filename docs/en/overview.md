# TokenSee Project Overview

> **Invisible Infrastructure** — enabling DApp developers to consume on-chain data like calling a Web2 REST API.

TokenSee is a blockchain data middleware layer that shields developers from the complexity of multi-chain development. Instead of handling RPC calls, ABI parsing, and price aggregation manually, developers receive semantic structured JSON — just like calling any standard REST API.

---

## I. Technology Stack

### Backend

| Category | Technology | Notes |
|---|---|---|
| **Runtime** | Node.js ≥ 20 + TypeScript | Strong typing, ESM modules |
| **Web Framework** | Express.js | Lightweight REST API |
| **Ethereum Interaction** | Viem 2.x | Modern Ethereum library, 90% lighter than ethers.js |
| **Database** | PostgreSQL 16 | Entity library, alert records, activity history |
| **Cache** | Redis 7 | Decoding results, entity labels, price data cache |
| **Data Validation** | Zod | Runtime schema validation |
| **HTTP Client** | Axios | External API calls (CoinGecko, Etherscan, etc.) |
| **Bloom Filter** | bloom-filters | Address deduplication, reducing duplicate alerts |
| **Development Tool** | tsx | Direct TypeScript execution, hot reload |
| **Testing** | Vitest | Unit testing framework |

### Frontend

| Category | Technology | Notes |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | SSR + CSR hybrid rendering |
| **Language** | React 19 + TypeScript | Modern React |
| **Styling** | Tailwind CSS 4.x | Atomic CSS, fast UI development |
| **Build Tool** | Next.js built-in Turbopack | Extremely fast dev startup and HMR |

### Infrastructure

| Category | Technology | Notes |
|---|---|---|
| **Containerization** | Docker + Docker Compose | One-command startup of PostgreSQL + Redis |
| **RPC Nodes** | Alchemy + Ankr + QuickNode | Multi-chain nodes, cost-optimized allocation |
| **Data Sources** | 20+ External APIs | Entity labels, prices, protocol data |

---

## II. Supported Blockchains

| Chain | Chain ID | Native Token | Block Time | RPC Strategy |
|---|---|---|---|---|
| Ethereum | 1 | ETH | 12s | Alchemy (primary) + QuickNode (fallback) |
| BNB Smart Chain | 56 | BNB | 3s | Ankr / QuickNode |
| Arbitrum | 42161 | ETH | 1s | Ankr (primary) + public RPC |
| Polygon | 137 | MATIC | 2s | Ankr (primary) + LlamaRPC |
| Base | 8453 | ETH | 2s | Ankr (primary) + public RPC |
| Optimism | 10 | ETH | 2s | Ankr (primary) + public RPC |
| Avalanche C-Chain | 43114 | AVAX | 2s | Public RPC |

---

## III. Core Features

### 1. Transaction Semantic Decoding

Decodes raw on-chain transactions into human-readable summaries, asset flows, and USD valuations.

**Decoding Pipeline (Three-Layer Strategy):**

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Local ABI Registry (0ms latency)               │
│   - In-memory Map with 30+ protocol ABIs (Uniswap,     │
│     Aave, Curve, etc.)                                  │
│   - Function selector → method name → param parsing     │
├─────────────────────────────────────────────────────────┤
│ Layer 2: 4byte.directory (~100ms network overhead)     │
│   - Unknown function selectors → query global library   │
│   - Results cached in Redis                             │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Pure Event Log Inference (fallback)           │
│   - Transfer / Swap / Approval events → asset flows     │
│   - Still recovers basic tx info with no calldata      │
└─────────────────────────────────────────────────────────┘
```

**Additional Capabilities:**

- **Internal Transfer Tracing**: Uses `debug_traceTransaction` callTracer to track internal ETH transfers within contracts (flash loans, multi-hop routing)
- **MEV Behavior Detection**: Auto-labels `flashloan` / `arbitrage` / `sandwich_bot`
- **Real-time USD Valuation**: Each asset change includes current price in USD
- **Historical Price Lookup**: `GET /v1/price/history` queries daily prices by block timestamp

### 2. Address Entity Library

Built-in 70,000+ on-chain address entity labels with three-layer querying:

| Layer | Data Source | Latency | Coverage |
|---|---|---|---|
| In-memory Map | Static entity data | 0ms | 70+ well-known addresses (Binance, Coinbase, Uniswap, etc.) |
| Redis Cache | Historical query results | ~1ms | Recently queried addresses |
| PostgreSQL | Full database | ~5ms | 70,000+ total entities |

**Entity Categories:**

- Centralized Exchanges (Binance 10, Coinbase 7, OKX, Kraken, Bybit, etc.)
- DeFi Protocols (Uniswap, Aave, Curve, Compound, PancakeSwap, etc.)
- Cross-chain Bridges (Arbitrum, Optimism, Polygon, Base, Wormhole)
- Stablecoin Contracts (USDC, USDT, DAI, BUSD)
- Risk Addresses (Tornado Cash and other mixers)
- VC / Funds (a16z, Paradigm, Jump Trading)
- Smart Money (14 curated wallets: VC / Quant / Market Maker / Whale)

### 3. Whale Alert Monitoring

Background Worker actively scans new blocks on 7 chains, flagging large transfers ≥ $100,000 USD.

| Chain | Scan Interval | Monitored Tokens |
|---|---|---|
| Ethereum | 30s | ETH + WETH + USDC + USDT + DAI + WBTC |
| BSC | 15s | BNB + BETH + BUSD + USDT + USDC |
| Arbitrum / Polygon / Base / Optimism | 45s (staggered) | ETH + WETH + USDC + USDT |
| Avalanche | 60s | AVAX + USDC + USDT + WAVAX |

**Alert Type Classification:**

- `exchange_inflow` — any address → known exchange
- `exchange_outflow` — known exchange → any address
- `bridge_deposit` — any address → known cross-chain bridge
- `bridge_withdrawal` — known cross-chain bridge → any address
- `whale_movement` — known fund / whale mutual transfers
- `large_transfer` — large transfer between unknown addresses

### 4. Portfolio Query

Queries token balances and USD valuations for any address across 7 chains.

- Native tokens (ETH / BNB / MATIC / AVAX, etc.)
- Major ERC-20 tokens
- Auto-fetch historical prices by block timestamp
- Multi-chain aggregated USD total value

### 5. Activity History

Semantic transaction history for any address, supporting:

- Multi-chain merged display
- Cursor-based pagination
- Filter by chain / type / amount
- Counterparty entity labels

### 6. Custom Alert Rule Engine

Users can create precise alert rules that automatically push notifications when conditions are met.

```json
// Example rule: Large USDC inflow to exchange on Ethereum (≥$500K)
{
  "name": "ETH USDC Large Exchange Inflow",
  "conditions": {
    "chains":        ["ethereum"],
    "asset_symbols": ["USDC"],
    "alert_types":   ["exchange_inflow"],
    "min_usd":       500000
  },
  "webhook_id": "wh_xxxx"
}
```

Supported condition dimensions: chain, asset type, alert type, min/max amount, specific address monitoring.

### 7. Real-time Push Channels

| Channel | Protocol | Use Case |
|---|---|---|
| SSE Stream | `GET /v1/alerts/stream` | Frontend real-time dashboard, zero-latency push |
| Webhook | HTTP POST | Backend system integration, HMAC-SHA256 signature verification |

### 8. Fund Flow Graph

Automatically builds one-hop fund flow relationship graph based on historical whale_alerts.

- Backend aggregates graph structure (nodes + edges + volume)
- Frontend renders with pure SVG + JS spring-force simulation (no external chart dependencies)
- Node colors by entity type
- Edge width proportional to fund volume

### 9. Smart Money Tracking

Curates 14 top-tier VC / market maker / whale wallets, presenting their large on-chain movements in real-time.

- Frontend Feed page (filter by category / chain)
- API endpoints for activity history and wallet list
- Free alternative to Nansen Smart Money subscription

---

## IV. Project Architecture

```
tokensee/
├── src/                           # Backend (Node.js + TypeScript)
│   ├── api/
│   │   ├── server.ts              # Express app factory
│   │   └── routes/
│   │       ├── tx.routes.ts       # POST /v1/tx/decode — transaction decoding
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
│   │   ├── pipeline/               # DecodePipeline + pipeline steps
│   │   │   ├── DecodePipeline.ts   # Pipeline orchestrator
│   │   │   ├── steps/
│   │   │   │   ├── Basic.step.ts      # Basic info (from/to/value/gas)
│   │   │   │   ├── Trace.step.ts      # Internal transfer tracing
│   │   │   │   ├── Semantic.step.ts   # Protocol semantic building
│   │   │   │   └── MevDetect.step.ts  # MEV behavior detection
│   │   ├── abi/
│   │   │   └── AbiRegistry.ts      # Three-layer ABI lookup (local/4byte/event)
│   │   ├── protocols/              # Known contract address registry
│   │   │   └── index.ts
│   │   └── semantic/               # Protocol semantic handlers
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
│   │   │   ├── EntityService.ts    # Entity query service (3-layer)
│   │   │   ├── entities.ts         # Static entity seed data
│   │   │   └── smartMoney.ts       # Smart Money wallet list
│   │   ├── monitor/
│   │   │   ├── WhaleMonitor.ts     # On-chain Worker entry point
│   │   │   ├── ChainScanner.ts     # Single-chain scanner (pause/resume)
│   │   │   └── BloomFilter.ts      # Address deduplication
│   │   ├── portfolio/
│   │   │   └── PortfolioService.ts # Balance query + USD valuation
│   │   ├── price/
│   │   │   └── PriceService.ts     # Price fetching (CoinGecko / on-chain)
│   │   ├── rpc/
│   │   │   └── RpcManager.ts       # Multi-chain RPC client (primary/failover)
│   │   ├── cache/
│   │   │   └── CacheService.ts     # Redis cache utilities
│   │   ├── webhook/
│   │   │   ├── WebhookService.ts   # Webhook push service
│   │   │   ├── WebhookUrlPolicy.ts # URL policy (rate limiting / idempotency)
│   │   │   └── alertQueue.ts       # Alert delivery queue
│   │   └── db/
│   │       ├── index.ts            # PostgreSQL connection pool
│   │       └── queries/            # SQL query templates
│   ├── config/
│   │   ├── index.ts                # env.ts merged exports
│   │   ├── chains.config.ts        # Chain configuration (ChainConfig)
│   │   └── constants.ts            # Global constants
│   ├── types/
│   │   ├── chain.types.ts          # Chain type definitions
│   │   ├── transaction.types.ts   # Transaction type definitions
│   │   ├── entity.types.ts         # Entity type definitions
│   │   └── alert.types.ts          # Alert type definitions
│   └── index.ts                    # Service entry (API + Worker startup)
├── web/                            # Frontend (Next.js 15 App Router)
│   └── src/
│       ├── app/                    # Page routes
│       │   ├── layout.tsx          # Root layout
│       │   ├── page.tsx           # Landing page
│       │   ├── globals.css         # Global styles
│       │   ├── dashboard/          # Dashboard page
│       │   ├── address/[addr]/    # Address detail (Portfolio/Activity/FundFlow tabs)
│       │   ├── alerts/            # Whale alerts page
│       │   ├── smart-money/        # Smart Money page
│       │   ├── intelligence/       # On-chain statistics page
│       │   └── docs/               # API docs + Playground
│       ├── components/
│       │   ├── AlertFeed.tsx       # Alert list component
│       │   ├── EntityBadge.tsx     # Entity label component
│       │   ├── ChainBadge.tsx      # Chain badge component
│       │   ├── FundFlowGraph.tsx   # Fund flow graph (SVG rendering)
│       │   ├── AlertStream.tsx     # SSE real-time stream component
│       │   └── ...
│       └── lib/
│           ├── api.ts              # API call wrapper
│           ├── types.ts            # Shared types
│           └── utils.ts            # Utility functions
├── migrations/                     # SQL migration files
├── scripts/                        # DevOps scripts
│   ├── migrate.ts                  # Database migration runner
│   ├── fetch-*.ts                  # External data import (20+ sources)
│   └── enrich-*.ts                 # Data quality enhancement scripts
├── docker-compose.yml              # PostgreSQL + Redis
├── package.json                   # Backend dependencies
├── tsconfig.json                  # TypeScript configuration
└── docs/                          # Project documentation
    ├── cn/                         # Chinese documentation
    │   ├── README.md
    │   ├── overview.md
    │   ├── product.md
    │   ├── api-reference.md
    │   ├── database.md
    │   ├── development.md
    │   └── entity-library-sources.md
    └── en/                         # English documentation (this directory)
        └── overview.md             # This file
```

---

## V. Core API Summary

| Endpoint | Method | Description |
|---|---|---|
| `/v1/tx/decode` | POST | Transaction semantic decoding (7 chains) |
| `/v1/account/:addr/portfolio` | GET | Multi-chain portfolio query + USD valuation |
| `/v1/account/:addr/activity` | GET | Address transaction history (cursor pagination) |
| `/v1/address/:addr/entity` | GET | Address entity label lookup |
| `/v1/address/:addr/ens` | GET | ENS reverse resolution |
| `/v1/address/:addr/graph` | GET | Fund flow graph (nodes + edges + volume) |
| `/v1/entity/:name/wallets` | GET | Institutional wallet clustering |
| `/v1/smart-money/activity` | GET | Smart Money activity feed |
| `/v1/smart-money/wallets` | GET | Smart Money wallet list |
| `/v1/alerts` | GET | Historical whale alerts (filterable) |
| `/v1/alerts/stream` | GET | SSE real-time stream |
| `/v1/alert-rules` | GET/POST | Custom alert rules CRUD |
| `/v1/alert-rules/:id` | PATCH/DELETE | Enable/disable/delete rules |
| `/v1/webhooks` | GET/POST | Webhook CRUD |
| `/v1/webhooks/:id/logs` | GET | Webhook delivery logs |
| `/v1/price/current` | GET | Batch current prices |
| `/v1/price/history` | GET | Historical daily prices |
| `/v1/stats` | GET | On-chain activity aggregation stats |
| `/health` | GET | Health check |

---

## VI. Data Sources

Entity library data from 20+ external sources, continuously imported via `scripts/fetch-*.ts`:

| Source | Content |
|---|---|
| Etherscan Labels API | Contract labels |
| CoinGecko | Token metadata |
| DeFi Llama | Protocol TVL / pool data |
| DeBank | Wallet portfolio data |
| Arkham Intelligence | Entity graphs |
| Dune Analytics | On-chain data aggregation |
| GoPlus Security | Security scores |
| OpenZeppelin Defender | Forta bot labels |
| Sybil | GitHub contributor addresses |
| GitHub API | Open-source protocol contributors |
| ENS | ENS domain names |
| Rotki | ETH lists |
| Trust Wallet | Token lists |
| Snapshot | DAO voters |
| EigenLayer API | Restaking data |
| Official Contracts | Protocol documentation |

---

## VII. Requirements

- Node.js ≥ 20
- Docker + Docker Compose
- PostgreSQL 16
- Redis 7
- API Key: Alchemy (Ethereum mainnet)

For detailed setup, see [Development Guide](./development.md).
