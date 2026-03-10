# Architecture

## Overview

TokenSee follows a **layered middleware** model. All chain-specific complexity (RPC, ABI parsing, price feeds) is encapsulated in service layers. Consumers see a uniform REST interface regardless of which chain the transaction lives on.

```
                   ┌────────────────────────────────────┐
                   │           Frontend (Next.js)        │
                   │  /, /address/[addr], /alerts, /docs │
                   └──────────────┬─────────────────────┘
                                  │ HTTP
                   ┌──────────────▼─────────────────────┐
                   │          Express API Server          │
                   │  /v1/tx/decode                       │
                   │  /v1/account/:addr/portfolio|activity│
                   │  /v1/address/:addr/entity            │
                   │  /v1/alerts[/stats]                  │
                   └──────────────┬─────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─────────▼──────────┐  ┌────────▼────────┐  ┌──────────▼──────────┐
│   DecodePipeline   │  │ PortfolioService│  │   WhaleMonitor      │
│  (on POST /decode) │  │                 │  │  (background worker)│
└─────────┬──────────┘  └────────┬────────┘  └──────────┬──────────┘
          │                      │                       │
          │         ┌────────────┴───────────────────────┤
          │         │                                     │
┌─────────▼─────────▼───┐  ┌──────────────┐  ┌──────────▼──────────┐
│      RpcManager        │  │ EntityService│  │     PriceService     │
│  (viem + multi-RPC)    │  │ (addr→label) │  │  (CoinGecko/on-chain)│
└────────────────────────┘  └──────────────┘  └─────────────────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
             ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
             │  Redis     │ │PostgreSQL │ │ 4byte.dir  │
             │  (cache)   │ │  (store)  │ │  (ABI sig) │
             └────────────┘ └───────────┘ └────────────┘
```

---

## Decode Pipeline

The core path for `POST /v1/tx/decode`. Four sequential steps, each enriching a shared `PipelineContext` object:

```
POST /v1/tx/decode { hash, chain }
  │
  ├─ 1. Validate (Zod)
  ├─ 2. Redis cache check (full result, TTL 5min)
  │
  └─ DecodePipeline.execute(hash, chain)
       │
       ├─ Step 1: FetchRawTxStep
       │     • viem.getTransaction() + getTransactionReceipt()
       │     • Result cached in Redis (TTL 2min)
       │
       ├─ Step 2: AbiDecodeStep
       │     Three-tier ABI resolution:
       │     a) Known ABI registry (local JSON files — Uniswap, Aave…)
       │     b) 4byte.directory HTTP lookup (function selector → sig)
       │     c) Event-only fallback (decode from logs if calldata unknown)
       │
       ├─ Step 3: ProtocolIdentifyStep
       │     • Maps to_address → protocol_id via known-addresses.ts
       │     • Covers: ETH (Uniswap V2/V3/Universal, Aave V3)
       │               BSC (PancakeSwap V2/V3)
       │
       └─ Step 4: SemanticStep
             • Routes to protocol handler (UniswapV3Handler, etc.)
             • Produces: tx_type, summary, assets_in[], assets_out[], fee_usd
             • Prices fetched from PriceService
       │
  ├─ Entity enrichment (EntityService.lookup for sender + contract)
  ├─ Cache result (Redis, TTL 5min)
  ├─ Persist to DB (non-blocking, fire-and-forget)
  └─ Return JSON response
```

---

## Whale Monitor

A singleton background worker that runs independently of HTTP requests.

```
WhaleMonitor.start()
  ├─ setInterval(scanChain('ethereum'), 30_000ms)
  └─ setInterval(scanChain('bsc'),      15_000ms)

scanChain(chain)
  ├─ Get latest block number via viem
  ├─ Scan blocks [lastBlock+1 … latestBlock]
  │
  ├─ scanNativeTransfers()
  │     • Fetch all txs in block range
  │     • Filter: value_usd ≥ $100,000
  │     • buildAlert() → classifyAlert() → persistAlert()
  │
  └─ scanErc20Transfers()
        • getLogs for ERC-20 Transfer topic
        • Tracked tokens: WETH, USDC, USDT, DAI, WBTC, LINK, UNI (ETH)
                          WBNB, USDT, USDC, BUSD (BSC)
        • Filter: amount_usd ≥ $100,000
        • buildAlert() → classifyAlert() → persistAlert()

classifyAlert(fromType, toType) → AlertType
  • exchange (from) → exchange_outflow
  • exchange (to)   → exchange_inflow
  • bridge          → bridge_deposit / bridge_withdrawal
  • fund/whale      → whale_movement
  • other           → large_transfer

Backoff: after 5 consecutive RPC failures → suspend chain for 10min
```

---

## Entity Service

Three-tier address resolution with escalating latency:

```
entityService.lookup(address, chain)
  │
  ├─ Tier 1: Static Map (ENTITY_MAP in known-entities.ts)
  │     0 ms — 70+ pre-seeded known addresses
  │
  ├─ Tier 2: Redis cache
  │     ~1 ms — previously DB-resolved addresses
  │
  └─ Tier 3: PostgreSQL (entities table)
        ~5 ms — full entity label library
```

Entity types: `exchange`, `protocol`, `bridge`, `fund`, `whale`, `mixer`, `nft`, `stablecoin`, `oracle`, `dao`, `other`

---

## Caching Strategy

| Data | Cache Key | TTL |
|---|---|---|
| Full decoded tx | `decode:{chain}:{hash}` | 5 min |
| Raw transaction | `tx:{chain}:{hash}` | 2 min |
| Transaction receipt | `receipt:{chain}:{hash}` | 2 min |
| Token price | `price:{symbol}` | 60 sec |
| Entity lookup | `entity:{chain}:{address}` | 24 hr |

---

## Protocol Handlers

Each handler implements a common interface and is responsible for:
- Identifying the specific function called (e.g. `exactInputSingle`)
- Parsing decoded ABI arguments
- Computing asset flows (what went in, what came out)
- Fetching USD values for assets

| Handler | Protocols |
|---|---|
| `UniswapV3Handler` | Uniswap V3 SwapRouter, SwapRouter02, UniversalRouter |
| `UniswapV2Handler` | Uniswap V2 Router, PancakeSwap V2 Router |
| `GenericTransferHandler` | Native ETH/BNB transfers, ERC-20 Transfer events |

Adding a new protocol: implement the handler interface, register the contract addresses in `known-addresses.ts`, add the handler to the `SemanticStep` router.
