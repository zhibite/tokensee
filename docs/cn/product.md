# TokenSee 产品定位与核心卖点

---

## 一、产品定位

### 一句话描述

> **TokenSee 是区块链数据的「隐形基础设施」——让开发者像调用 Web2 REST API 一样消费链上数据。**

### 解决的核心问题

区块链数据天然是**机器友好、人类不友好**的。一笔 Uniswap 兑换交易，链上存储的是：

```
input:  0x414bf389000000000000000000000000c02aaa39...
logs:   Transfer(0x..., 0x..., 115792089...)
        Swap(0x..., 0, 3200000000, 5250000000000000000, 0)
```

而开发者/用户真正需要的是：

```json
{
  "summary": "Swapped 1.5 ETH for 3,200 USDC",
  "assets_out": [{ "symbol": "ETH", "amount": "1.5", "amount_usd": "5250" }],
  "assets_in":  [{ "symbol": "USDC", "amount": "3200", "amount_usd": "3200" }],
  "protocol": "uniswap-v3",
  "sender_entity": { "label": "Binance Hot Wallet 1", "entity_type": "exchange" }
}
```

这两种形式之间的鸿沟，就是 TokenSee 存在的理由。

---

## 二、目标用户

| 用户群体 | 痛点 | TokenSee 的价值 |
|---|---|---|
| **DApp 前端开发者** | 要展示用户交易历史，但解析 ABI + 价格换算要写大量胶水代码 | 一个 API 调用，直接拿到带摘要、资产流向和 USD 估值的 JSON；API Playground 可在文档页直接试用 |
| **链上数据分析师** | 需要识别交易对手方是谁（交易所？巨鲸？协议？）| 内置 70+ 知名地址实体库，Smart Money 追踪跟踪 VC/做市商动向，资金流图谱可视化 |
| **量化交易/套利机器人** | 需要实时监控大额资金动向，判断市场情绪 | 巨鲸预警 + 自定义告警规则引擎（按链/资产/地址/金额精准过滤）+ Webhook 推送 |
| **安全/风控团队** | 需要快速判断某地址是否为已知混币器或高风险实体 | MEV 识别、资金流图谱追踪路径，Tornado Cash 等风险地址实体标注 |
| **Web3 产品经理** | 需要向投资人演示多链数据能力，不想花两周搭基础设施 | 完整的前后端一键启动，含可视化 Demo 页 |

---

## 三、核心功能与卖点

### 🔍 卖点 1：交易语义解码

**核心差异：** 市面上大多数区块链 API（Etherscan、Alchemy、Moralis）返回的是原始 RPC 数据或简单的参数列表，需要开发者自行处理 ABI 解码、代币精度换算、价格映射。TokenSee 直接输出**人类可读的语义结果**。

**能力矩阵：**

| 解码能力 | 说明 |
|---|---|
| 已知协议 ABI | 本地注册 Uniswap V2/V3/Universal、Aave V3、Curve、Compound V3、GMX、Pendle、EigenLayer 等，零延迟解码 |
| 4byte.directory 兜底 | 未知函数选择器自动查询全球最大函数签名库 |
| 纯事件日志推断 | calldata 完全未知时，从 Transfer/Swap 等事件反推资产流向 |
| **内部转账追踪** | 通过 `debug_traceTransaction` callTracer 捕获合约内部 ETH 转移（闪电贷、多跳路由等） |
| USD 实时估值 | 每笔资产变化均附带当时价格的 USD 等值 |
| **历史 USD 价格** | 按区块时间戳查询历史日级价格（`GET /v1/price/history`），支持追溯历史交易价值 |
| Gas 费用折算 | gas_used × gas_price 自动换算为 USD 手续费 |

**输出示例：**

```
"Swapped 1.5 ETH ($5,250) for 3,200 USDC on Uniswap V3"
"Added liquidity: 0.5 ETH + 1,600 USDC to Uniswap V3 ETH/USDC pool"
"Repaid 5,000 USDC loan on Aave V3, fee: $1.20"
"Open Long position on GMX — Size $250,000"
"Buy PT via Pendle — 10.0000 → 10.5230"
"Restake into EigenLayer strategy"
```

---

### 🏷️ 卖点 2：链上地址实体库 + 机构钱包聚类

**核心差异：** 解码一笔交易只知道"0x28c6...d60"转入了一个合约，远不够。知道"这是 **Binance 热钱包**转入了 **Uniswap V3**"，信息密度才真正提升。更进一步，`GET /v1/entity/:name/wallets` 可以一次性拉出某机构旗下全部已知钱包地址，支持机构级别的资金追踪。

**覆盖范围（70+ 地址，持续扩充）：**

| 类别 | 已覆盖机构 |
|---|---|
| 中心化交易所 | Binance（10 个钱包）、Coinbase（7 个）、OKX、Kraken、Bybit、Bitfinex、HTX、Gate.io |
| DeFi 核心协议 | Uniswap V2/V3/Universal、Aave V3、Compound、Curve Finance、Balancer、1inch、Lido |
| 跨链基础设施 | Arbitrum 官方桥、Optimism 桥、Polygon 桥、Base 桥、Wormhole |
| 稳定币合约 | USDC（Circle）、USDT（Tether）、DAI（MakerDAO）、BUSD |
| 风险地址 | Tornado Cash（混币器标注） |
| 机构/基金 | a16z、Paradigm、Jump Trading |

**三层查询，零额外延迟：**
1. 静态内存 Map（0ms）→ 命中 70+ 预置地址
2. Redis 缓存（~1ms）→ 历史查询过的地址
3. PostgreSQL（~5ms）→ 完整数据库

**每笔解码交易自动标注发送方和合约方：**

```json
"sender_entity": { "label": "Binance Hot Wallet 1", "entity_type": "exchange" },
"contract_entity": { "label": "Uniswap Universal Router v2", "entity_type": "protocol" }
```

**机构钱包聚类示例：**

```
GET /v1/entity/Binance/wallets
→ 返回 Binance 旗下所有已知钱包地址（含标签、类型、来源）
```

---

### 🐋 卖点 3：巨鲸预警 + 自定义告警规则 + Webhook 推送

**核心差异：** 这是一个真正运行的链上监控系统。不只是简单阈值过滤——自定义规则引擎让用户精准定义「哪种预警值得推送」，支持多维度条件组合，推送到独立 Webhook URL，覆盖所有主流场景。

**工作机制：**
- ETH 每 30s、BSC 每 15s、ARB/BASE/OP/POLYGON 每 45s（错峰调度，避免 Alchemy 并发限速）、AVAX 每 60s 扫描新区块
- 同时监控原生代币转账 + 主流 ERC-20 代币（WETH/USDC/USDT/DAI/WBTC/WAVAX 等）
- 阈值：单笔 ≥ $100,000 USD 触发记录
- **SSE 实时推送**：`GET /v1/alerts/stream` 建立持久连接，新预警零延迟推送到前端
- **Webhook 推送**：注册自定义 URL 后，每次触发预警自动 HTTP POST，带 HMAC-SHA256 签名验证，失败重试最多 3 次

**智能分类，而非简单过滤：**

| 预警类型 | 触发条件 | 业务含义 |
|---|---|---|
| `exchange_inflow` | 任意地址 → 已知交易所 | 大户准备卖出？中心化出售压力 |
| `exchange_outflow` | 已知交易所 → 任意地址 | 大户提币？看涨信号或转移资产 |
| `bridge_deposit` | 任意地址 → 已知跨链桥 | 跨链迁移，关注目标链动态 |
| `bridge_withdrawal` | 已知跨链桥 → 任意地址 | 资金从其他链流入 |
| `whale_movement` | 已知基金/巨鲸互转 | 机构资产调仓 |
| `large_transfer` | 未知地址大额转移 | 新巨鲸出没，值得追踪 |

**自定义告警规则（Rule Engine）：**

用户可创建规则，当预警满足以下任意组合条件时，定向推送到指定 Webhook：

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

支持条件维度：链（chains）、资产类型（asset_symbols）、预警类型（alert_types）、金额范围（min_usd / max_usd）、特定地址监控（addresses）。规则独立绑定 Webhook，与全局 Webhook 互不干扰。

**Webhook 示例：**

```bash
# 注册 Webhook
POST /v1/webhooks
{ "name": "My Bot", "url": "https://my.app/hook", "min_usd": 500000, "chains": ["ethereum"] }
→ { "secret": "xxx（一次性，请妥善保存）" }

# 收到推送时验证签名
X-TokenSee-Signature: sha256=<hmac-sha256(body, secret)>
```

---

### 🔬 卖点 4：MEV 行为识别

**核心差异：** 同一笔 Swap，是普通用户的交易还是套利机器人在刷利润？TokenSee 在解码流水线最后一步自动打标。

每笔解码结果新增 `mev_type` 字段，三种识别模式：

| 类型 | 识别规则 | 业务含义 |
|---|---|---|
| `flashloan` | 函数名含 flash / flashloan，或协议为 dYdX/Euler | 当笔交易借用闪电贷，大概率为套利或清算操作 |
| `arbitrage` | assets_in 与 assets_out 含相同代币，且出方金额 ≥ 入方 | 循环套利，输入输出同种代币并实现盈利 |
| `sandwich_bot` | 发送方为已知 MEV 机器人地址（JaredFromSubway 等） | 典型三明治攻击机器人，属于提取用户价值的恶意行为 |

```json
// 解码结果示例
{
  "summary": "Swap 1 WETH → USDC on Uniswap V3",
  "mev_type": "arbitrage",
  ...
}
```

非 MEV 交易 `mev_type` 为 `null`，不影响正常展示。

---

### 🧠 卖点 5：Smart Money 追踪

**核心差异：** 知道"某笔大额转移"发生并不够，知道"Paradigm 刚把 ETH 从 Coinbase 提出来"才有 Alpha。TokenSee 维护一批经过人工研究整理的「聪明钱」地址库，将其大额链上行为实时呈现，相当于一个免费的 Nansen Smart Money 订阅源。

**追踪的钱包类别：**

| 类别 | 代表机构 |
|---|---|
| VC 基金 | Paradigm、a16z Crypto、Dragonfly Capital、Multicoin Capital、Polychain Capital |
| 量化/做市商 | Jump Trading、Wintermute、Cumberland DRW |
| 链上巨鲸 | 早期矿工持仓、大型 DeFi 参与者 |
| DAO 国库 | Gitcoin Treasury、Uniswap DAO Treasury |

**前端 Feed（`/smart-money` 页面）功能：**
- 按类别筛选（VC / Quant / Market Maker / Whale / DAO）
- 按链筛选（7 条链）
- 展示：机构名称、角色（发送方/接收方）、资产+金额、交易对手方标签、交易类型、相对时间
- 支持分页加载更多

**API 接口：**

```
GET /v1/smart-money/activity?category=vc&chain=ethereum&limit=50
→ 返回聪明钱最近大额转账记录（含机构名、角色、对手方标签）

GET /v1/smart-money/wallets
→ 返回所有追踪的钱包列表（含地址、名称、类别、标签）
```

---

### 🗺️ 卖点 6：资金流图谱可视化

**核心差异：** 调查一个地址时，知道"它转了多少钱"不如知道"它和谁有往来，资金怎么流动"。TokenSee 基于历史 whale_alerts 数据，自动构建地址的一跳资金流关系图，并在前端用纯 SVG + spring-force 布局渲染。

**后端：** `GET /v1/address/:addr/graph?chain=ethereum`
- 查询该地址作为发送方或接收方的全部大额转账记录
- 聚合为图结构：节点（地址+实体标签+交易次数+总体量）、边（方向+资产类型+体量+频次）
- 并行 lookup 实体标注

**前端（地址详情页 Fund Flow Tab）：**
- 纯 SVG 渲染，无第三方图表库依赖
- JS spring-force 布局（80 次迭代弹簧+斥力模拟）
- 目标地址居中，counterparts 环状分布
- 节点颜色按实体类型（exchange=蓝/bridge=紫/fund=橙等）
- 边宽度正比于资金体量
- Hover 显示详细信息面板（地址/实体名/交易次数/体量），点击跳转地址详情

---

### 📊 卖点 7：多链统一接口（7 条链）

**一套 API，七条链（ETH + BSC + ARB + POLYGON + BASE + OP + AVAX），无缝扩展。**

开发者无需关心：
- 不同链使用不同的 RPC 提供商（ETH/ARB/POLYGON/BASE/OP/AVAX 用 Alchemy，BSC 用 QuickNode/公共 RPC）
- 各链区块时间的差异（ETH 12s / BSC 3s / ARB 1s / POLYGON 2s / BASE 2s / OP 2s / AVAX 2s）
- 各链上相同协议的合约地址差异（Uniswap V3 在 ARB/POLYGON/BASE/OP 地址各不同）
- 原生代币和封装代币的映射（ETH/WETH、MATIC/WMATIC、BNB/WBNB、AVAX/WAVAX）

这些差异全部在 `RpcManager` + `ChainConfig` + `EvmAdapter` 层面被吸收，上层代码看到的始终是统一的 `chain` 参数：

```json
{ "hash": "0x...", "chain": "avalanche" }
// 返回格式与 ethereum 完全一致
```

**各链协议覆盖：**

| 链 | DEX | 借贷 | 衍生品/其他 |
|---|---|---|---|
| Ethereum | Uniswap V2/V3/Universal, Curve | Aave V3, Compound V3 | EigenLayer（Restaking）, Pendle（收益代币化） |
| BSC | PancakeSwap V2/V3 | — | — |
| Arbitrum | Uniswap V2/V3/Universal | Aave V3 | GMX V1+V2（永续合约）, Pendle |
| Polygon | Uniswap V2/V3/Universal, QuickSwap V2 | Aave V3 | — |
| Base | Uniswap V2/V3/Universal, Aerodrome | Aave V3 | — |
| Optimism | Uniswap V2/V3/Universal, Velodrome | Aave V3 | — |
| Avalanche | Trader Joe, Pangolin | Aave V3 | GMX V1 |

---

### ⚡ 卖点 8：性能优先的缓存设计

| 场景 | 响应时间目标 |
|---|---|
| 同一笔交易第二次解码 | < 5ms（Redis 命中） |
| 已知地址实体查询 | < 1ms（内存 Map） |
| 全新交易首次解码（ETH） | 300–800ms（RPC + ABI + 价格） |

缓存策略：
- 解码结果缓存 5 分钟（同一笔 tx 通常不变）
- 原始 RPC 数据缓存 2 分钟
- 代币价格缓存 60 秒
- 历史价格永久缓存（链上历史价格不变）
- 实体标签缓存 24 小时

---

## 四、竞品对比

| 维度 | Etherscan API | Alchemy | Moralis | Nansen | **TokenSee** |
|---|---|---|---|---|---|
| 原始交易数据 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 语义化摘要（自然语言） | ✗ | ✗ | 部分 | ✗ | ✓ |
| 资产流向（含 USD） | ✗ | ✗ | 部分 | ✓ | ✓ |
| 内部转账追踪 | ✗ | 部分（付费） | ✗ | ✗ | ✓ |
| 历史价格查询 | ✗ | ✗ | 部分 | ✓ | ✓ |
| 地址实体标注 | 部分（标签） | ✗ | ✗ | ✓ | ✓ |
| 机构钱包聚类查询 | ✗ | ✗ | ✗ | 部分 | ✓ |
| Smart Money 追踪 | ✗ | ✗ | ✗ | ✓（付费） | ✓（免费） |
| 资金流图谱可视化 | ✗ | ✗ | ✗ | 付费 | ✓ |
| 实时巨鲸预警（SSE 推送） | ✗ | ✗ | ✗ | 付费 | ✓ |
| Webhook 主动推送 | ✗ | 部分 | 部分 | 付费 | ✓ |
| 自定义告警规则引擎 | ✗ | ✗ | ✗ | 付费 | ✓ |
| MEV 行为识别 | ✗ | ✗ | ✗ | 部分 | ✓ |
| 链上活动统计 Dashboard | ✗ | 部分 | 部分 | ✓ | ✓ |
| **交互式 API Playground** | ✗ | ✓ | ✓ | ✗ | ✓ |
| 多链统一 API（7 条链） | 分链独立 | 部分 | ✓ | 部分 | ✓ |
| 自托管/私有部署 | ✗ | ✗ | ✗ | ✗ | ✓ |
| 开源可扩展 | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## 五、技术护城河

1. **三层 ABI 解码 + 内部转账追踪**
   本地 ABI → 4byte.directory → 事件日志推断，覆盖率远超单一方案。对于长尾未知协议，也能从日志中恢复资产流向。此外，通过 `debug_traceTransaction` callTracer 还原合约内部 ETH 转移，解决闪电贷、多跳路由等场景下资产方向不可见的问题。

2. **地址实体图谱 + 机构钱包聚类 + Smart Money**
   纯静态 Map 实现零延迟查询，与 Redis + PostgreSQL 三层结构结合，兼顾速度与可扩展性。ENS 正向/反向解析内置验证，防止伪造反向记录。`GET /v1/entity/:name/wallets` 支持按机构名批量拉取旗下全部已知钱包，覆盖 CEX、基金、协议多类实体。Smart Money 模块人工策展 14 个顶级 VC/做市商/巨鲸地址，将机构动向转化为结构化 Feed，替代价格高昂的 Nansen 订阅。

3. **主动监控 + 自定义规则引擎 + 多通道实时推送**
   绝大多数区块链 API 是被动响应查询，TokenSee 的 WhaleMonitor 主动扫描 7 条链的新区块，实时分类预警写入数据库。自定义告警规则引擎（AlertRulesService）在每次预警写入后同步评估所有激活规则，匹配则定向推送到规则绑定的 Webhook，支持链/资产/类型/金额/地址五维过滤，无需用户写任何代码。推送通道双轨并行：SSE 持久连接（前端实时大屏）+ Webhook HTTP POST（后端系统集成）。

4. **协议级语义理解（可扩展框架）**
   每个 DeFi 协议有独立的 Handler（实现 `canHandle()` + `buildSemantic()`），新协议接入只需添加 Handler 和注册合约地址，不影响其他逻辑。已支持：Uniswap V2/V3/Universal、Aave V3、Curve Finance、Compound V3、PancakeSwap V2/V3、QuickSwap V2、Aerodrome、**GMX V1+V2**（永续合约）、**Pendle**（收益代币化）、**EigenLayer**（再质押）。

5. **MEV 识别流水线步骤（MevDetectStep）**
   作为解码流水线最后一步，无 RPC 调用、纯内存分析，不增加响应延迟。通过函数名模式（flashloan）、资产流向循环分析（arbitrage）、已知机器人地址匹配（sandwich_bot）三路并行检测，结果写入 `mev_type` 字段。新增检测规则只需扩展 `MevDetector.ts`，零改动流水线主体。

6. **资金流图谱（零依赖 SVG 渲染）**
   后端聚合 whale_alerts 为图结构（节点+边），并行 lookup 实体标签；前端纯 JS spring-force 模拟（无 D3 / ECharts 等依赖），80 次弹簧+斥力迭代收敛，渲染性能好、包体积无增量。图谱嵌入地址详情页 Fund Flow Tab，与 Portfolio/Activity 三 Tab 无缝切换。

7. **多链统一抽象层（7 链）**
   `EvmAdapter` + `RpcManager` + `KNOWN_ADDRESSES` 三层设计将链差异完全屏蔽。添加新链只需：① 在 viem/chains 中引入链对象 ② 配置 RPC URL ③ 注册协议地址——无需修改任何业务逻辑。Solana 等非 EVM 链通过替换 Adapter 层即可接入。

---

## 六、核心 API 一览

| 接口 | 方法 | 说明 |
|---|---|---|
| `/v1/tx/decode` | POST | 交易语义解码，支持 7 条 EVM 链 |
| `/v1/account/:addr/portfolio` | GET | 多链持仓查询，自动合并 USD 总价值 |
| `/v1/account/:addr/activity` | GET | 地址历史交易记录，游标分页 |
| `/v1/address/:addr/entity` | GET | 地址实体标签查询（ENS + 机构标签） |
| `/v1/address/:addr/ens` | GET | ENS 反向解析 |
| `/v1/address/:addr/graph` | GET | **资金流图谱**：一跳转账关系图（节点+边+体量） |
| `/v1/entity/:name/wallets` | GET | **机构钱包聚类**：返回某机构旗下全部已知地址 |
| `/v1/smart-money/activity` | GET | **Smart Money 动向**：VC/做市商/巨鲸最近大额转账 |
| `/v1/smart-money/wallets` | GET | Smart Money 追踪钱包列表 |
| `/v1/alerts` | GET | 历史巨鲸预警列表，支持链/类型/金额过滤 |
| `/v1/alerts/stream` | GET | **SSE 实时流**，持久连接，新预警即时推送 |
| `/v1/alert-rules` | GET/POST | **自定义告警规则**：CRUD 管理，多维条件过滤 |
| `/v1/alert-rules/:id` | PATCH/DELETE | 启用/禁用/删除规则 |
| `/v1/price/current` | GET | 批量查询当前代币 USD 价格 |
| `/v1/price/history` | GET | 按 Unix 时间戳查询历史日级价格 |
| `/v1/webhooks` | POST | 注册 Webhook URL（返回一次性密钥） |
| `/v1/webhooks` | GET | 列出所有 Webhook |
| `/v1/webhooks/:id` | DELETE | 删除 Webhook |
| `/v1/webhooks/:id/logs` | GET | 查看最近 50 次 Webhook 投递记录 |
| `/v1/stats` | GET | **链上活动聚合统计**：预警数、总体量、链/类型/资产分布，支持 1h/24h/7d 窗口 |

---

## 七、产品路线图

### ✅ MVP（已完成）
- [x] 7 链交易解码 API（ETH / BSC / ARB / POLYGON / BASE / OP / AVAX，三层 ABI 策略）
- [x] 50,000+ 地址实体库（协议 / 黑客 / DAO / Token / 制裁名单等，20 个来源）
- [x] 巨鲸预警监控 Worker（7 链全覆盖）
- [x] 多链持仓查询 API（原生 + ERC-20 代币）
- [x] 地址 Activity 历史记录流（游标分页）
- [x] 前端 Demo（落地页 + 地址画像 + 预警大屏）

### ✅ 近期（已完成）
- [x] ENS 反向解析 + 正向验证（地址画像页展示 ENS 名称）
- [x] BSC 代币余额接入 BSCScan API
- [x] API Key 鉴权 middleware（开发可选、生产强制）
- [x] 更多 DeFi 协议解码：Aave V3、Curve Finance、Compound V3
- [x] SSE 实时预警流（`GET /v1/alerts/stream`，替代轮询）

### ✅ 中期（已完成）
- [x] **新增链：Arbitrum、Polygon、Base**（5 链统一接口）
- [x] **历史价格查询**（`GET /v1/price/history`，CoinGecko 日级历史价格）
- [x] **Trace API**（`debug_traceTransaction` callTracer，追踪内部 ETH 转账）
- [x] 前端多链展示（链徽章颜色区分、区块浏览器链接适配）

### ✅ 近中期扩展（已完成）
- [x] **Webhook 推送**：巨鲸预警 HTTP POST 到用户自定义 URL，HMAC-SHA256 签名 + 自动重试
- [x] **机构钱包聚类**：`GET /v1/entity/:name/wallets`，按机构名返回旗下全部已知地址
- [x] **新增协议：GMX**（永续合约，开/平仓/Swap，ARB + AVAX 双链）
- [x] **新增协议：Pendle**（收益代币化，PT/YT 买卖 + 流动性操作）
- [x] **新增协议：EigenLayer**（再质押存入/排队提款/委托）
- [x] **新增链：Optimism、Avalanche**（7 链统一接口）

### ✅ 功能深化（已完成）
- [x] **MEV 识别**：解码流水线新增 MevDetectStep，自动标注 `flashloan` / `arbitrage` / `sandwich_bot`
- [x] **链上统计 API**：`GET /v1/stats?window=1h|24h|7d`，聚合预警量、总体量、链/类型/资产分布
- [x] **Dashboard 页面**：可视化展示 7 链活跃度、预警类型分布、Top 10 资产排行（纯 CSS 条形图）
- [x] **Webhook 管理 UI**：前端支持注册/查看/删除 Webhook，Secret 一次性展示 + 验签代码示例
- [x] **地址详情页完善**：Portfolio + Activity + Fund Flow 三 Tab，Activity 支持按链过滤、游标加载更多
- [x] **CORS 跨域支持**：Express 中间件支持前后端分离部署，`FRONTEND_URL` 环境变量可配置
- [x] **RPC 容错升级**：Avalanche 自动跳过 Alchemy（免费 Key 不支持），ARB/BASE/OP/POLYGON fallback 改为 LlamaRPC；WhaleMonitor 启动错峰调度

### ✅ 产品核心 & 数据深度（已完成）
- [x] **API Playground**：`/docs` 页面内嵌交互式调试组件，支持 tx/decode、portfolio、alerts 三个接口实时调用，零跳转即可试用
- [x] **Smart Money 追踪**：策展 14 个 VC/做市商/巨鲸钱包，`GET /v1/smart-money/activity` + 前端 Feed（按类别/链过滤），平替 Nansen Smart Money 付费功能
- [x] **自定义告警规则引擎**：`POST /v1/alert-rules` 创建规则，支持链/资产/类型/金额/地址五维条件，每条规则独立绑定 Webhook，AlertRulesService 在 WhaleMonitor 每次写入后同步评估；前端 AlertRulesManager 组件可视化管理
- [x] **资金流图谱可视化**：`GET /v1/address/:addr/graph` 聚合 whale_alerts 为图数据；前端 FundFlowGraph 纯 SVG + JS spring-force 渲染（无外部依赖），嵌入地址详情页 Fund Flow Tab

### 🔭 长期规划
- [ ] SaaS 版本（托管服务 + 按量计费 API Key）
- [ ] 机构数据订阅（全量实体图谱 + 历史预警数据导出）
- [ ] AI 分析层：自然语言描述链上地址行为画像
- [ ] Solana 支持（SVM 解码器，独立 Adapter 层）
- [ ] 图谱多跳扩展（当前 depth=1，扩展到 2-3 跳追踪洗钱/混币路径）
