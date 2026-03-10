# TokenSee

> **Invisible Infrastructure** — DApp developers use on-chain data like Web2 REST APIs.

TokenSee is a blockchain data middleware layer that abstracts away multi-chain complexity. Instead of writing chain-specific RPC calls, ABI parsing, and price aggregation, developers get clean, semantically enriched JSON — the same way they consume any REST API.

---

## Features

| Feature | Description |
|---|---|
| **Transaction Decoder** | Decode any ETH / BSC tx into human-readable summary, asset flows, and USD values |
| **Address Entity Library** | 70+ known on-chain addresses (Binance, Coinbase, Uniswap, Aave…) mapped to real-world entities |
| **Whale Alert Monitor** | Background worker scans new blocks every 15–30s, flags transfers ≥ $100k, classifies as exchange inflow/outflow, bridge, whale movement |
| **Portfolio API** | Token balances + USD values for any address across ETH + BSC |
| **Activity Feed** | Paginated semantic transaction history for any address |
| **Multi-chain** | Ethereum mainnet + BNB Smart Chain, extensible to more |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- Docker + Docker Compose
- API keys: Alchemy (ETH), QuickNode or public RPC (BSC)

### 1. Configure environment

```bash
cp .env.example .env
# Fill in: ALCHEMY_API_KEY, QUICKNODE_BSC_URL, DATABASE_URL, REDIS_URL, API_KEY_SALT
```

### 2. Start infrastructure

```bash
docker-compose up -d
# Starts postgres:16 on :5432, redis:7 on :6379
```

### 3. Run database migrations

```bash
npm run migrate
```

### 4. Start the API server

```bash
npm run dev       # development (tsx watch)
npm run build && npm start   # production
```

Server starts at `http://localhost:3000`.

### 5. Start the frontend (optional)

```bash
cd web
npm run dev       # http://localhost:3000 (or :3002 if port taken)
```

---

## Project Structure

```
tokensee/
├── src/                      # Backend (Node.js + TypeScript)
│   ├── api/
│   │   ├── server.ts         # Express app factory
│   │   └── routes/
│   │       ├── tx.routes.ts          # POST /v1/tx/decode
│   │       ├── account.routes.ts     # GET /v1/account/:addr/portfolio|activity
│   │       ├── address.routes.ts     # GET /v1/address/:addr/entity
│   │       └── alert.routes.ts       # GET /v1/alerts, /v1/alerts/stats
│   ├── decoder/
│   │   ├── pipeline/         # DecodePipeline + 4 pipeline steps
│   │   ├── abi/              # AbiRegistry (3-tier lookup)
│   │   ├── protocols/        # Known address maps
│   │   └── semantic/         # Protocol-specific handlers (Uniswap, Aave…)
│   ├── services/
│   │   ├── entity/           # EntityService + static known-entities seed
│   │   ├── monitor/          # WhaleMonitor background worker
│   │   ├── portfolio/        # PortfolioService (token balance + price)
│   │   ├── price/            # PriceService (CoinGecko / on-chain)
│   │   ├── rpc/              # RpcManager (viem clients, multi-endpoint fallback)
│   │   ├── cache/            # Redis helpers
│   │   └── db/               # PostgreSQL pool + query helpers
│   ├── config/               # chains.config.ts, env.ts
│   └── types/                # Shared TypeScript interfaces
├── web/                      # Frontend (Next.js 14 App Router)
│   └── src/
│       ├── app/              # Pages: /, /address/[addr], /alerts, /docs
│       ├── components/       # UI components
│       └── lib/              # api.ts, types.ts, utils.ts
├── migrations/               # SQL migration files (run in order)
├── scripts/                  # migrate.ts runner
├── docker-compose.yml
└── docs/                     # ← you are here
```

---

## Documentation Index

| File | Contents |
|---|---|
| [architecture.md](./architecture.md) | System design, data flow diagrams, decode pipeline |
| [api-reference.md](./api-reference.md) | Full REST API reference with request/response examples |
| [database.md](./database.md) | Database schema, indexes, entity types |
| [development.md](./development.md) | Dev setup, environment variables, adding new chains/protocols |
