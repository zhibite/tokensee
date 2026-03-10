# 开发指南

## 环境变量

将 `.env.example` 复制为 `.env` 并填写以下配置：

| 变量名 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | API 服务端口，默认 `3000` |
| `NODE_ENV` | 否 | `development` \| `production`，默认 `development` |
| `DATABASE_URL` | ✓ | PostgreSQL 连接串，如 `postgresql://tokensee:tokensee_dev_password@localhost:5432/tokensee` |
| `REDIS_URL` | ✓ | Redis 连接串，如 `redis://localhost:6379` |
| `ALCHEMY_API_KEY` | ✓ | 以太坊主网 Alchemy API Key |
| `QUICKNODE_BSC_URL` | 否 | QuickNode BSC RPC 地址，不填则使用公共端点 |
| `API_KEY_SALT` | ✓ | API 密钥哈希盐值（任意随机字符串即可） |
| `COINGECKO_API_KEY` | 否 | CoinGecko Pro API Key，用于更高请求限额 |

**Docker Compose 默认值**（运行 `docker-compose up -d` 后可直接使用）：
- PostgreSQL：`postgresql://tokensee:tokensee_dev_password@localhost:5432/tokensee`
- Redis：`redis://localhost:6379`

---

## 本地启动

```bash
# 1. 安装依赖
npm install

# 2. 启动基础设施（PostgreSQL + Redis）
docker-compose up -d

# 3. 执行数据库迁移
npm run migrate

# 4. 启动后端（热重载开发模式）
npm run dev

# 5. 启动前端（可选）
cd web && npm install && npm run dev
```

**服务端口：**
- 后端 API：`http://localhost:3000`
- 前端：`http://localhost:3001`（如端口被占用则切换到 3002）

---

## npm 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 使用 `tsx watch` 启动后端（热重载） |
| `npm run build` | 编译 TypeScript 到 `dist/` |
| `npm start` | 运行编译后的生产版本 |
| `npm run migrate` | 执行所有待执行的 SQL 迁移 |
| `npm test` | 使用 Vitest 运行测试 |
| `npm run test:watch` | 以 Watch 模式运行测试 |

---

## 技术栈

| 层级 | 技术选型 |
|---|---|
| 运行时 | Node.js ≥ 20，TypeScript 5，ESM 模块 |
| Web 框架 | Express 4 |
| 区块链客户端 | viem（非 ethers.js） |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 参数校验 | Zod |
| HTTP 客户端 | Axios（4byte.directory、价格 API） |
| 前端 | Next.js 14（App Router），Tailwind CSS |
| 测试框架 | Vitest |

**TypeScript 配置要点：**
- `"module": "ESNext"`，`"moduleResolution": "bundler"`
- 所有 import 路径使用 `.js` 扩展名（ESM 规范）
- JSON ABI 文件通过 `createRequire` 加载（当前 tsconfig 不支持直接 import JSON）

---

## 扩展新链

1. 在 `src/config/chains.config.ts` 中添加链配置
2. 在 `src/services/rpc/RpcManager.ts` 中注册 RPC 端点
3. 在 `src/decoder/protocols/known-addresses.ts` 中注册该链的已知合约地址
4. 更新 `WhaleMonitor`，添加监控代币列表和扫描间隔
5. 更新前端 `web/src/lib/utils.ts` 中的 `CHAIN_LABELS`

---

## 添加新协议处理器

1. 创建 `src/decoder/semantic/{Protocol}Handler.ts`
2. 实现 `ProtocolHandler` 接口：
   ```typescript
   interface ProtocolHandler {
     canHandle(context: PipelineContext): boolean;
     handle(context: PipelineContext): Promise<void>;
   }
   ```
3. 在 `src/decoder/pipeline/steps/Semantic.step.ts` 中注册处理器
4. 在 `src/decoder/protocols/known-addresses.ts` 中添加合约地址
5. （可选）将 ABI JSON 文件放入 `src/decoder/abi/`，并在 `AbiRegistry.ts` 中注册

---

## 扩充地址实体库

**方案 A — 静态预置（永久有效，零延迟）**

在 `src/services/entity/known-entities.ts` 中添加条目：

```typescript
{
  address: '0xabc...123',
  chain: 'ethereum',      // 或 'multi'
  label: '某交易所热钱包',
  entity_name: '某交易所',
  entity_type: 'exchange',
  confidence: 'high',
  tags: ['hot-wallet'],
},
```

然后执行一次 `entityService.seedDatabase()` 将数据同步到 PostgreSQL。

**方案 B — 仅入库**

直接 INSERT 到 `entities` 表。首次查询后会被 Redis 缓存（有效期 24 小时）。

---

## 开发规范

- **错误处理**：路由处理器内不使用 `throw`，所有错误捕获后返回结构化 `ApiError` JSON
- **非阻塞写入**：解码流水线的数据库持久化全部采用 fire-and-forget（不 `await` INSERT）
- **缓存优先**：查询 RPC 或数据库之前，始终先检查 Redis
- **Zod v4+**：错误数组使用 `.issues`，不用 `.errors`
- **地址比较**：存储或比较地址前，始终调用 `.toLowerCase()` 转小写

---

## 已知限制与待办事项

| 功能点 | 状态 | 说明 |
|---|---|---|
| BSC 代币余额 | 部分支持 | 返回空数组，需接入 BSCScan API |
| ETH 内部转账 | 有限支持 | Universal Router 的 ETH 输出需要 `trace_transaction` |
| Activity 记录流 | 仅本库数据 | 只展示通过本 API 解码过的交易，非完整链上历史 |
| WebSocket 推送 | 未实现 | 巨鲸预警目前为前端定时轮询（30 秒间隔） |
| API Key 鉴权 | 表结构已就绪 | `api_keys` 表已存在，鉴权中间件未接入 |
| ENS 解析 | 未实现 | 地址画像页可以展示 ENS 名称 |
| Aave V3 处理器 | 存根 | 协议已识别，语义解码尚未完整实现 |
