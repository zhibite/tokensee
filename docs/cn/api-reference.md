# API 参考文档

基础 URL：`http://localhost:3000`（开发环境）

所有响应均为 JSON 格式。成功响应包含 `"success": true`，失败响应包含 `"success": false` 和 `error` 对象。

---

## 健康检查

### `GET /health`

```
200 OK
{ "status": "ok", "timestamp": "2026-03-09T10:00:00.000Z" }
```

---

## 交易解码

### `POST /v1/tx/decode`

将任意以太坊或 BSC 交易解码为语义化的结构化响应。

**请求体**

```json
{
  "hash": "0xabc...123",
  "chain": "ethereum"
}
```

| 字段 | 类型 | 必填 | 可选值 |
|---|---|---|---|
| `hash` | string | ✓ | 0x 开头的 66 位交易哈希 |
| `chain` | string | ✓ | `"ethereum"` \| `"bsc"` |

**成功响应**

```json
{
  "success": true,
  "data": {
    "hash": "0xabc...123",
    "chain": "ethereum",
    "block_number": 21000000,
    "timestamp": 1720000000,
    "sender": "0x1234...abcd",
    "contract_address": "0x68b3...f04f",
    "type": "swap",
    "protocol": "uniswap-v3",
    "summary": "Swapped 1.5 ETH for 3,200.00 USDC",
    "function_name": "exactInputSingle",
    "decode_method": "known_abi",
    "assets_in": [
      {
        "symbol": "ETH",
        "address": "0x0000...0000",
        "amount": "1.5",
        "amount_usd": "5250.00",
        "decimals": 18
      }
    ],
    "assets_out": [
      {
        "symbol": "USDC",
        "address": "0xa0b8...ec18",
        "amount": "3200.00",
        "amount_usd": "3200.00",
        "decimals": 6
      }
    ],
    "gas_used": 150000,
    "gas_price_gwei": "12.5",
    "fee_usd": "2.81",
    "sender_entity": {
      "label": "Binance Hot Wallet 1",
      "entity_name": "Binance",
      "entity_type": "exchange"
    },
    "contract_entity": {
      "label": "Uniswap Universal Router v2",
      "entity_name": "Uniswap",
      "entity_type": "protocol"
    }
  }
}
```

**失败响应**

```json
{
  "success": false,
  "error": {
    "code": "TX_NOT_FOUND",
    "message": "Transaction not found on ethereum"
  }
}
```

**错误码**

| 错误码 | HTTP | 描述 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 哈希格式无效或链名称不支持 |
| `TX_NOT_FOUND` | 404 | 指定链上未找到该交易 |
| `DECODE_FAILED` | 500 | 解码流水线内部错误 |

**`type` 可选值**

`swap`（兑换）· `transfer`（转账）· `liquidity_add`（添加流动性）· `liquidity_remove`（移除流动性）· `borrow`（借贷）· `repay`（还款）· `stake`（质押）· `nft_mint`（NFT 铸造）· `nft_transfer`（NFT 转移）· `contract_deploy`（合约部署）· `contract_interaction`（合约调用）· `unknown`（未知）

**`decode_method` 说明**

| 值 | 含义 |
|---|---|
| `known_abi` | 使用本地注册的已知 ABI 解码 |
| `four_byte` | 通过 4byte.directory 查询函数签名解码 |
| `event_only` | calldata 未知，仅从事件日志推断 |
| `raw` | 无法解码，返回原始 calldata |

---

## 账户

### `GET /v1/account/:address/portfolio`

查询某地址在各链上的代币余额和 USD 估值。

**查询参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `chains` | `ethereum,bsc` | 逗号分隔的链名列表 |

**响应**

```json
{
  "success": true,
  "data": {
    "address": "0x1234...abcd",
    "total_value_usd": "125430.50",
    "chains": {
      "ethereum": {
        "native": {
          "symbol": "ETH",
          "amount": "10.5",
          "amount_usd": "36750.00"
        },
        "tokens": [
          {
            "symbol": "USDC",
            "address": "0xa0b8...ec18",
            "amount": "50000.00",
            "amount_usd": "50000.00",
            "decimals": 6
          }
        ]
      },
      "bsc": { "native": { "..." }, "tokens": [ "..." ] }
    }
  }
}
```

---

### `GET /v1/account/:address/activity`

分页获取某地址的语义化交易历史。返回以该地址为发送方、已通过解码接口处理过的交易记录。

**查询参数**

| 参数 | 默认值 | 最大值 | 说明 |
|---|---|---|---|
| `chain` | 全部链 | — | 按链过滤：`ethereum` 或 `bsc` |
| `limit` | `20` | `50` | 每页返回条数 |
| `cursor` | — | — | 分页游标（上一页响应中的 ISO 时间戳） |

**响应**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "hash": "0xabc...123",
        "chain": "ethereum",
        "block_number": 21000000,
        "timestamp": 1720000000,
        "sender": "0x1234...abcd",
        "contract_address": "0x68b3...f04f",
        "type": "swap",
        "protocol": "uniswap-v3",
        "summary": "Swapped 1.5 ETH for 3,200.00 USDC",
        "assets_in": [ "..." ],
        "assets_out": [ "..." ],
        "fee_usd": "2.81",
        "function_name": "exactInputSingle",
        "decode_method": "known_abi"
      }
    ],
    "cursor": "2026-03-09T09:55:00.000Z",
    "has_more": true
  }
}
```

> **注意：** Activity 数据来源于 `transactions` 表，仅包含通过 `POST /v1/tx/decode` 接口解码过的交易，并非完整的链上历史。

---

## 地址实体

### `GET /v1/address/:address/entity`

查询知名链上地址对应的真实机构标签。

**查询参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `chain` | `ethereum` | 查询所在链的上下文 |

**响应 — 找到**

```json
{
  "success": true,
  "data": {
    "address": "0x28c6c06298d514db089934071355e5743bf21d60",
    "chain": "ethereum",
    "label": "Binance Hot Wallet 1",
    "entity_name": "Binance",
    "entity_type": "exchange",
    "confidence": "high",
    "source": "manual",
    "tags": ["hot-wallet", "centralized"]
  }
}
```

**响应 — 未找到**

```json
{
  "success": true,
  "data": null
}
```

---

## 巨鲸预警

### `GET /v1/alerts`

获取巨鲸监控检测到的大额链上转账流（≥ $100,000 USD）。

**查询参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `chain` | 全部 | 按链过滤：`ethereum` 或 `bsc` |
| `type` | 全部 | 按预警类型过滤（见下表） |
| `min_usd` | `100000` | 最低转账金额（USD） |
| `limit` | `20` | 返回条数（最大 100） |
| `cursor` | — | 分页游标（上一页最后一条的 `created_at` ISO 时间戳） |

**预警类型说明**

| 类型 | 描述 |
|---|---|
| `large_transfer` | 未知地址之间的大额转账 |
| `exchange_inflow` | 资金流入已知交易所（入金） |
| `exchange_outflow` | 资金从已知交易所流出（出金） |
| `whale_movement` | 已知基金或巨鲸钱包的资金移动 |
| `bridge_deposit` | 资金存入跨链桥 |
| `bridge_withdrawal` | 资金从跨链桥提取 |

**响应**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "tx_hash": "0xdef...456",
        "chain": "ethereum",
        "block_number": 21000100,
        "timestamp": 1720000300,
        "from_address": "0xbe0e...f7a8",
        "from_label": "Binance Hot Wallet 14",
        "from_entity": "Binance",
        "from_type": "exchange",
        "to_address": "0x1234...abcd",
        "to_label": null,
        "to_entity": null,
        "to_type": null,
        "asset_symbol": "USDT",
        "asset_address": "0xdac1...1ec7",
        "amount": "5000000.00",
        "amount_usd": "5000000.00",
        "alert_type": "exchange_outflow",
        "created_at": "2026-03-09T10:05:00.000Z"
      }
    ],
    "cursor": "2026-03-09T10:05:00.000Z",
    "has_more": false
  }
}
```

---

### `GET /v1/alerts/stats`

巨鲸预警聚合统计数据。

```json
{
  "success": true,
  "data": {
    "total_alerts": 1284,
    "total_volume_usd": "48200000000.00",
    "by_type": {
      "exchange_inflow": 312,
      "exchange_outflow": 298,
      "large_transfer": 421,
      "whale_movement": 187,
      "bridge_deposit": 44,
      "bridge_withdrawal": 22
    },
    "by_chain": {
      "ethereum": 891,
      "bsc": 393
    },
    "last_24h": 87
  }
}
```

---

## 通用错误码

| 错误码 | HTTP | 描述 |
|---|---|---|
| `INVALID_ADDRESS` | 400 | 非有效 EVM 地址格式 |
| `INVALID_CHAIN` | 400 | 不支持的链名称 |
| `VALIDATION_ERROR` | 400 | 请求体未通过 Schema 校验 |
| `TX_NOT_FOUND` | 404 | 未找到该交易哈希 |
| `NOT_FOUND` | 404 | 通用资源未找到 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
