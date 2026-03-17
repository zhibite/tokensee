# 地址库数据来源

本文档记录 TokenSee 实体库（Entity Library）的所有数据来源，包括已接入的免费开源数据集和可扩展的付费 API 平台。

---

## 一、已接入的免费开源数据源

| 来源 | 脚本 | 条数 | 说明 |
|------|------|------|------|
| github-labels | `fetch-github` | 32,267 | etherscan-labels GitHub 仓库，ETH/ARB/BSC/POLYGON/OP |
| forta-github | `fetch-forta-labels` | 6,880 | Forta labelled-datasets 公开仓库，黑客/钓鱼地址 |
| rotki | `fetch-rotki` | 3,948 | Rotki 资产数据库，7 链 EVM 代币 |
| sybil | `fetch-sybil` | 2,686 | Uniswap Sybil 治理委托人，Twitter 实名验证 |
| scamsniffer | `fetch-scam` | 2,530 | ScamSniffer 钓鱼黑名单 |
| snapshot | `fetch-snapshot` | 1,449 | Snapshot DAO 国库地址，90k+ 空间 |
| defillama | `fetch-labels` | 827 | DeFiLlama 协议代币地址 |
| defillama-protocols | `fetch-dl-protocols` | 825 | DeFiLlama 协议合约地址（多链） |
| mew-darklist | `fetch-scam` | 651 | MyEtherWallet 黑名单 |
| superchain-list | `fetch-tokenlists` | 604 | Optimism Superchain 跨链代币列表 |
| trustwallet | `fetch-trustwallet` | 223 | Trust Wallet 官方代币列表 |
| ethereum-lists | `fetch-ethlist` | 187+ | ethereum-lists/contracts 社区维护协议库 |
| sourcify | 自动富化 | 180 | Sourcify 合约验证平台（EnrichmentService） |
| uniswap-list | `fetch-tokenlists` | 179 | Uniswap default-token-list |
| import | `import-labels` | 127 | 手动导入的高置信度种子数据 |
| dawsbot | `fetch-dawsbot` | 105 | dawsbot/eth-labels 安全标签 |
| alchemy | 自动富化 | 99 | Alchemy Token API 自动标注 |
| ofac | `fetch-ofac` | 83 | OFAC 制裁名单（SDN_ADVANCED.XML） |
| ens | `fetch-ens` | 27 | ENS 反向解析 KOL/机构钱包 |
| clustering | 自动聚类 | 21 | ClusteringService 识别的交易所充值地址 |
| onchain | 自动富化 | 7 | 链上 name() 方法读取的合约名称 |
| defillama-treasury | `fetch-treasury` | 2 | DeFiLlama DAO 国库钱包 |

**当前总计：53,907+ 条**（ethereum-lists 全量导入进行中）

---

## 二、可扩展的付费 API 平台

### 一线平台（数据最全，价格较高）

#### 1. Arkham Intelligence
- 覆盖链：ETH / BSC / ARB / SOL / BTC 等 15+ 链
- 数据量：数百万标注地址，涵盖机构、交易所、KOL、智能钱包
- API 示例：`/api/v1/intel/address/{address}` → 实时返回实体名 + 类型
- 价格：按请求计费，企业合作定价
- 特点：机构级实体图谱，识别关联地址集群，业界覆盖最广
- **项目状态：已集成框架**（`src/services/entity/ArkhamService.ts`），补充 `ARKHAM_API_KEY` 即可启用

#### 2. Nansen
- 覆盖链：ETH + 20+ 链
- 数据量：250M+ 标注地址，Smart Money 标签体系最完善
- API 端点：`/labels`、`/smart-money`
- 价格：$150/月起（Research 版），企业版另议
- 特点：Smart Money 分层（Tier 1/2/3）是业界标准，基金/鲸鱼标签质量最高

#### 3. Chainalysis
- 覆盖链：BTC / ETH / 所有主流链
- 数据量：行业最大合规数据库，制裁/黑名单/混币器
- API：KYT（Know Your Transaction）实时风险评分
- 价格：$30,000+/年，主要面向合规机构
- 特点：OFAC 制裁名单实时更新，监管合规必备

---

### 中端平台（性价比较好）

#### 4. TRM Labs
- 覆盖链：ETH + BTC + 40+ 链
- 数据：制裁/黑客/暗网地址，风险评分 API
- 价格：$5,000–$20,000/年
- 特点：专注合规/反洗钱，黑名单覆盖最全，适合 B2B 合规场景

#### 5. Dune Analytics
- 覆盖：以太坊为主
- 数据：社区维护的 `labels` 表，40w+ 以太坊地址标签
- 价格：$350/月（Premium API）
- 特点：去中心化社区贡献，DEX 标签准确，可批量导出

#### 6. DeBank
- 覆盖链：ETH + 30+ EVM 链
- API：地址 DeFi 持仓 + 协议交互历史，可推断身份
- 价格：按量计费（Cloud API）
- 特点：实时持仓数据，适合 Smart Money 追踪和资产分析

---

### 专项数据

#### 7. GoPlus Security
- 数据：恶意合约、钓鱼地址黑名单
- API：`/api/v1/address_security/{address}`，免费额度较大
- 价格：有免费层，付费扩量
- 特点：专注安全风险标签，BSC/ETH 黑名单覆盖很全，**扩容性价比最高**

#### 8. Blocksec / Phalcon
- 数据：合约漏洞利用攻击者地址
- API：交易模拟 + 安全标签
- 价格：企业定价

---

## 三、扩展优先级建议

```
当前已有 53,907 条  →  推荐接入顺序：

1. GoPlus    ★★★  免费/低成本，安全黑名单最快扩容（预计 +10w 条）
2. Arkham    ★★★  框架已就绪，补 API Key 即用，实体质量最高
3. Nansen    ★★☆  Smart Money 标签独一无二，适合 KOL/基金追踪场景
4. Dune      ★★☆  ETH 社区标签 40w+，性价比高，一次性批量导入
5. TRM       ★☆☆  合规场景专用，日常使用场景有限
```

---

## 四、接入新数据源步骤

1. 在 `scripts/` 目录新建 `fetch-{source}.ts`
2. 统一写入 `entities` 表，设置 `source`、`confidence`、`entity_type`、`tags`
3. 在 `package.json` 添加 `fetch-{source}` / `fetch-{source}:dry` 脚本
4. 更新本文档的数据来源表格
