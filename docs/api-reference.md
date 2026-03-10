# API Reference

Base URL: `http://localhost:3000` (development)

All responses are JSON. Successful responses include `"success": true`; errors include `"success": false` with an `error` object.

---

## Health Check

### `GET /health`

```
200 OK
{ "status": "ok", "timestamp": "2026-03-09T10:00:00.000Z" }
```

---

## Transaction Decoder

### `POST /v1/tx/decode`

Decode any Ethereum or BSC transaction into a human-readable, semantically enriched response.

**Request body**

```json
{
  "hash": "0xabc...123",
  "chain": "ethereum"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `hash` | string | ✓ | 0x-prefixed 66-char tx hash |
| `chain` | string | ✓ | `"ethereum"` \| `"bsc"` |

**Response — success**

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
      { "symbol": "ETH", "address": "0x0000...0000", "amount": "1.5", "amount_usd": "5250.00", "decimals": 18 }
    ],
    "assets_out": [
      { "symbol": "USDC", "address": "0xa0b8...ec18", "amount": "3200.00", "amount_usd": "3200.00", "decimals": 6 }
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

**Response — error**

```json
{
  "success": false,
  "error": {
    "code": "TX_NOT_FOUND",
    "message": "Transaction not found on ethereum"
  }
}
```

**Error codes**

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid hash format or unknown chain |
| `TX_NOT_FOUND` | 404 | Transaction not found on the specified chain |
| `DECODE_FAILED` | 500 | Internal pipeline error |

**`type` values**

`swap` · `transfer` · `liquidity_add` · `liquidity_remove` · `borrow` · `repay` · `stake` · `nft_mint` · `nft_transfer` · `contract_deploy` · `contract_interaction` · `unknown`

**`decode_method` values**

| Value | Meaning |
|---|---|
| `known_abi` | Decoded using locally registered ABI |
| `four_byte` | Function signature resolved via 4byte.directory |
| `event_only` | Calldata unknown; decoded from event logs only |
| `raw` | Could not decode; raw calldata returned |

---

## Account

### `GET /v1/account/:address/portfolio`

Fetch token balances and USD values for an address across chains.

**Query parameters**

| Param | Default | Description |
|---|---|---|
| `chains` | `ethereum,bsc` | Comma-separated list of chains |

**Response**

```json
{
  "success": true,
  "data": {
    "address": "0x1234...abcd",
    "total_value_usd": "125430.50",
    "chains": {
      "ethereum": {
        "native": { "symbol": "ETH", "amount": "10.5", "amount_usd": "36750.00" },
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
      "bsc": { "native": { ... }, "tokens": [ ... ] }
    }
  }
}
```

---

### `GET /v1/account/:address/activity`

Paginated semantic transaction history for an address. Returns decoded transactions where this address is the sender.

**Query parameters**

| Param | Default | Max | Description |
|---|---|---|---|
| `chain` | all chains | — | Filter by `ethereum` or `bsc` |
| `limit` | `20` | `50` | Number of results per page |
| `cursor` | — | — | Pagination cursor (ISO timestamp from previous response) |

**Response**

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
        "assets_in": [ ... ],
        "assets_out": [ ... ],
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

**Note:** Activity data comes from the `transactions` table — only transactions previously decoded via `POST /v1/tx/decode` appear here.

---

## Address Entity

### `GET /v1/address/:address/entity`

Look up the real-world entity label for a known on-chain address.

**Query parameters**

| Param | Default | Description |
|---|---|---|
| `chain` | `ethereum` | Chain context for the lookup |

**Response — found**

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

**Response — not found**

```json
{
  "success": true,
  "data": null
}
```

---

## Whale Alerts

### `GET /v1/alerts`

Stream of large on-chain transfers detected by the whale monitor (≥ $100,000 USD).

**Query parameters**

| Param | Default | Description |
|---|---|---|
| `chain` | all | Filter by `ethereum` or `bsc` |
| `type` | all | Filter by alert type (see below) |
| `min_usd` | `100000` | Minimum transfer value in USD |
| `limit` | `20` | Number of results (max 100) |
| `cursor` | — | Pagination: last `created_at` ISO timestamp |

**Alert types**

| Type | Description |
|---|---|
| `large_transfer` | Large transfer between unknown addresses |
| `exchange_inflow` | Funds moving into a known exchange |
| `exchange_outflow` | Funds moving out of a known exchange |
| `whale_movement` | Known fund or whale wallet moving funds |
| `bridge_deposit` | Funds entering a cross-chain bridge |
| `bridge_withdrawal` | Funds exiting a cross-chain bridge |

**Response**

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

Aggregated statistics for the whale alert feed.

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

## Common Error Codes

| Code | HTTP | Description |
|---|---|---|
| `INVALID_ADDRESS` | 400 | Address is not a valid EVM address |
| `INVALID_CHAIN` | 400 | Chain not in `['ethereum', 'bsc']` |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `TX_NOT_FOUND` | 404 | Transaction hash not found |
| `NOT_FOUND` | 404 | Generic not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
