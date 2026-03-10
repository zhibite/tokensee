# Development Guide

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API server port. Default: `3000` |
| `NODE_ENV` | No | `development` \| `production`. Default: `development` |
| `DATABASE_URL` | ✓ | PostgreSQL connection string. e.g. `postgresql://tokensee:tokensee_dev_password@localhost:5432/tokensee` |
| `REDIS_URL` | ✓ | Redis connection string. e.g. `redis://localhost:6379` |
| `ALCHEMY_API_KEY` | ✓ | Alchemy API key for Ethereum mainnet RPC |
| `QUICKNODE_BSC_URL` | No | QuickNode BSC RPC URL. Falls back to public endpoints if omitted |
| `API_KEY_SALT` | ✓ | Secret salt for hashing API keys (any random string) |
| `COINGECKO_API_KEY` | No | CoinGecko Pro API key for higher rate limits |

**Docker Compose defaults** (used when running `docker-compose up -d`):
- Postgres: `postgresql://tokensee:tokensee_dev_password@localhost:5432/tokensee`
- Redis: `redis://localhost:6379`

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
docker-compose up -d

# 3. Run migrations
npm run migrate

# 4. Start backend in watch mode
npm run dev

# 5. (Optional) Start frontend
cd web && npm install && npm run dev
```

**Ports:**
- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:3001` (or 3002 if 3001 is taken)

---

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start backend with `tsx watch` (hot reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run migrate` | Run all pending SQL migrations |
| `npm test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20, TypeScript 5, ESM |
| Web framework | Express 4 |
| Blockchain client | viem (not ethers.js) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Validation | Zod |
| HTTP client | Axios (4byte.directory, price APIs) |
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Testing | Vitest |

**TypeScript config notes:**
- `"module": "ESNext"`, `"moduleResolution": "bundler"`
- All imports use `.js` extension (ESM convention)
- JSON ABI files loaded via `createRequire` (ESM has no native JSON import in this tsconfig)

---

## Adding a New Chain

1. **Add chain config** in `src/config/chains.config.ts`
2. **Add RPC endpoints** in `src/services/rpc/RpcManager.ts`
3. **Register known addresses** in `src/decoder/protocols/known-addresses.ts`
4. **Update WhaleMonitor** — add tracked tokens + interval
5. **Update frontend** — add chain to `CHAIN_LABELS` in `web/src/lib/utils.ts`

---

## Adding a New Protocol Handler

1. Create `src/decoder/semantic/{Protocol}Handler.ts`
2. Implement the `ProtocolHandler` interface:
   ```typescript
   interface ProtocolHandler {
     canHandle(context: PipelineContext): boolean;
     handle(context: PipelineContext): Promise<void>;
   }
   ```
3. Register the handler in `src/decoder/pipeline/steps/Semantic.step.ts`
4. Add the contract address(es) in `src/decoder/protocols/known-addresses.ts`
5. (Optional) Add ABI JSON in `src/decoder/abi/` and register in `AbiRegistry.ts`

---

## Adding Entities to the Label Library

**Option A — Static seed (permanent, zero-latency)**

Add entries to `src/services/entity/known-entities.ts`:

```typescript
{
  address: '0xabc...123',
  chain: 'ethereum',      // or 'multi'
  label: 'My Exchange Hot Wallet',
  entity_name: 'My Exchange',
  entity_type: 'exchange',
  confidence: 'high',
  tags: ['hot-wallet'],
},
```

Then call `entityService.seedDatabase()` once to persist to PostgreSQL.

**Option B — Database only**

Insert directly into the `entities` table. Will be resolved via tier-3 lookup (Redis-cached after first hit).

---

## Project Conventions

- **Error handling**: Never `throw` in route handlers — catch all errors and return structured `ApiError` JSON
- **Non-blocking writes**: All DB persistence from the decode pipeline uses fire-and-forget (no `await` on insert)
- **Cache first**: Always check Redis before hitting the RPC or database
- **Zod v4+**: Use `.issues` not `.errors` for error arrays
- **Address comparison**: Always `.toLowerCase()` before storing or comparing addresses

---

## Known Limitations / Future Work

| Area | Status | Notes |
|---|---|---|
| BSC token balances | Partial | Returns empty; needs BSCScan API integration |
| ETH internal transfers | Limited | `trace_transaction` needed for Universal Router ETH output |
| Activity feed | DB-backed only | Only shows txs decoded via our API, not full on-chain history |
| WebSocket alerts | Not built | Whale alerts are polled every 30s on frontend |
| API key auth | Schema only | `api_keys` table exists; enforcement not implemented |
| ENS resolution | Not built | Address pages could display ENS names |
| Aave V3 handler | Stub | Protocol identified but semantic decode incomplete |
