import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'API Reference · TokenSee',
  description: 'TokenSee REST API reference — decode transactions, fetch portfolios, stream activity.',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-12 flex gap-10">

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="hidden lg:block w-52 shrink-0">
          <nav className="sticky top-10 space-y-6 text-sm">
            <SideSection title="Getting Started">
              <SideLink href="#overview">Overview</SideLink>
              <SideLink href="#base-url">Base URL</SideLink>
              <SideLink href="#auth">Authentication</SideLink>
              <SideLink href="#errors">Errors</SideLink>
              <SideLink href="#rate-limits">Rate Limits</SideLink>
            </SideSection>
            <SideSection title="Endpoints">
              <SideLink href="#tx-decode">POST /tx/decode</SideLink>
              <SideLink href="#portfolio">GET /account/portfolio</SideLink>
              <SideLink href="#activity">GET /account/activity</SideLink>
            </SideSection>
            <SideSection title="Reference">
              <SideLink href="#types">Data Types</SideLink>
              <SideLink href="#chains">Supported Chains</SideLink>
              <SideLink href="#protocols">Protocols</SideLink>
            </SideSection>
          </nav>
        </aside>

        {/* ── Content ─────────────────────────────── */}
        <main className="flex-1 min-w-0 space-y-16">

          {/* Overview */}
          <Section id="overview" title="Overview">
            <p className="text-zinc-400 text-sm leading-relaxed">
              The TokenSee API is a REST interface for on-chain blockchain data. It abstracts
              chain complexity — RPC nodes, ABI decoding, price feeds, log parsing — into
              simple, typed JSON responses.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed mt-3">
              All endpoints return JSON. Request bodies use <code className="inline-code">application/json</code>.
              Responses follow a consistent envelope: <code className="inline-code">{"{ success, data }"}</code> on
              success or <code className="inline-code">{"{ success: false, error: { code, message } }"}</code> on failure.
            </p>
          </Section>

          {/* Base URL */}
          <Section id="base-url" title="Base URL">
            <CodeBlock lang="text">{`https://api.tokensee.com`}</CodeBlock>
            <p className="text-zinc-500 text-xs mt-3">
              All endpoints are versioned under <code className="inline-code">/v1</code>.
              Development: <code className="inline-code">http://localhost:3000/v1</code>
            </p>
          </Section>

          {/* Auth */}
          <Section id="auth" title="Authentication">
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              Pass your API key in the <code className="inline-code">X-Api-Key</code> request header.
              Keys can be created in the dashboard (coming soon). During development, the header is optional.
            </p>
            <CodeBlock lang="http">{`POST /v1/tx/decode HTTP/1.1
Host: api.tokensee.com
Content-Type: application/json
X-Api-Key: tsk_live_xxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
          </Section>

          {/* Errors */}
          <Section id="errors" title="Errors">
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              Error responses always have <code className="inline-code">success: false</code> and
              an <code className="inline-code">error</code> object with a machine-readable <code className="inline-code">code</code>.
            </p>
            <CodeBlock lang="json">{`{
  "success": false,
  "error": {
    "code": "INVALID_HASH",
    "message": "Transaction hash must be 66 hex characters"
  }
}`}</CodeBlock>
            <Table
              headers={['Code', 'HTTP', 'Meaning']}
              rows={[
                ['INVALID_HASH', '400', 'Malformed transaction hash'],
                ['INVALID_ADDRESS', '400', 'Malformed Ethereum address'],
                ['INVALID_CHAIN', '400', 'Chain not in supported list'],
                ['TX_NOT_FOUND', '404', 'Hash not found on the specified chain'],
                ['DECODE_FAILED', '422', 'Transaction found but could not be decoded'],
                ['RATE_LIMITED', '429', 'Too many requests — back off and retry'],
                ['INTERNAL_ERROR', '500', 'Unexpected server error'],
              ]}
            />
          </Section>

          {/* Rate Limits */}
          <Section id="rate-limits" title="Rate Limits">
            <Table
              headers={['Plan', 'Requests / min', 'Requests / day']}
              rows={[
                ['Free (no key)', '10', '500'],
                ['Developer', '60', '10,000'],
                ['Pro', '300', '100,000'],
                ['Enterprise', 'Unlimited', 'Unlimited'],
              ]}
            />
            <p className="text-zinc-500 text-xs mt-3">
              Rate limit headers: <code className="inline-code">X-RateLimit-Limit</code>,{' '}
              <code className="inline-code">X-RateLimit-Remaining</code>,{' '}
              <code className="inline-code">X-RateLimit-Reset</code> (Unix timestamp).
            </p>
          </Section>

          {/* ── POST /v1/tx/decode ─────────────────── */}
          <div id="tx-decode">
            <EndpointHeader method="POST" path="/v1/tx/decode" />

            <Section title="Description">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Decodes a transaction hash into a structured, human-readable result.
                Includes transaction type, protocol, assets moved (with USD values),
                gas cost, and a one-line English summary.
              </p>
              <p className="text-zinc-400 text-sm leading-relaxed mt-2">
                Results are cached in Redis for 10 minutes. The <code className="inline-code">cached</code> flag
                in the response indicates a cache hit.
              </p>
            </Section>

            <Section title="Request Body">
              <ParamTable rows={[
                { name: 'hash', type: 'string', req: true, desc: '66-character hex transaction hash (0x-prefixed)' },
                { name: 'chain', type: '"ethereum" | "bsc"', req: true, desc: 'Which chain to query' },
              ]} />
              <CodeBlock lang="json">{`{
  "hash": "0x3ca204e45e3801a19cd0217b70fdd33eb0af6cf3e7310878f19ee216e5ff329e",
  "chain": "ethereum"
}`}</CodeBlock>
            </Section>

            <Section title="Response">
              <CodeBlock lang="json">{`{
  "success": true,
  "data": {
    "hash": "0x3ca204e45e3801a19cd0217b70fdd33eb0af6cf3e7310878f19ee216e5ff329e",
    "chain": "ethereum",
    "block_number": 21936620,
    "timestamp": 1740636671,
    "sender": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    "contract_address": "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    "type": "swap",
    "protocol": "uniswap-universal",
    "protocol_version": null,
    "summary": "Swapped 0.5 ETH for 1,482.30 USDC via Uniswap",
    "assets_in": [
      {
        "address": "0x0000000000000000000000000000000000000000",
        "symbol": "ETH",
        "decimals": 18,
        "amount": "0.5",
        "amount_raw": "500000000000000000",
        "amount_usd": "1490.25"
      }
    ],
    "assets_out": [
      {
        "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "symbol": "USDC",
        "decimals": 6,
        "amount": "1482.30",
        "amount_raw": "1482300000",
        "amount_usd": "1482.30"
      }
    ],
    "gas_used": "184520",
    "gas_price_gwei": "12.4",
    "fee_eth": "0.002288",
    "fee_usd": "6.82",
    "function_name": "execute",
    "function_args": null,
    "decode_method": "known_abi"
  },
  "cached": false,
  "decode_latency_ms": 142
}`}</CodeBlock>
            </Section>

            <Section title="Field Reference">
              <FieldTable rows={[
                { field: 'type', type: 'TransactionType', desc: 'Semantic type — see Types section' },
                { field: 'protocol', type: 'string | null', desc: 'Protocol identifier (e.g. "uniswap-v3")' },
                { field: 'summary', type: 'string', desc: 'One-line English description of the transaction' },
                { field: 'assets_in', type: 'AssetAmount[]', desc: 'Assets consumed by the sender' },
                { field: 'assets_out', type: 'AssetAmount[]', desc: 'Assets received by the sender' },
                { field: 'fee_eth', type: 'string', desc: 'Gas fee in native token (ETH or BNB)' },
                { field: 'fee_usd', type: 'string | null', desc: 'Gas fee in USD (null if price unavailable)' },
                { field: 'decode_method', type: 'DecodeMethod', desc: 'How the ABI was resolved — see Types section' },
                { field: 'cached', type: 'boolean', desc: 'True if served from Redis cache' },
                { field: 'decode_latency_ms', type: 'number', desc: 'End-to-end decode time in milliseconds' },
              ]} />
            </Section>
          </div>

          {/* ── GET /v1/account/:address/portfolio ── */}
          <div id="portfolio">
            <EndpointHeader method="GET" path="/v1/account/:address/portfolio" />

            <Section title="Description">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Returns the complete token portfolio for an address across all specified chains.
                Includes native token balance, ERC-20 holdings (via Alchemy), real-time USD prices,
                and per-chain totals.
              </p>
            </Section>

            <Section title="Path Parameters">
              <ParamTable rows={[
                { name: 'address', type: 'string', req: true, desc: 'Checksummed or lowercase Ethereum-compatible address' },
              ]} />
            </Section>

            <Section title="Query Parameters">
              <ParamTable rows={[
                { name: 'chains', type: 'string', req: false, desc: 'Comma-separated chain list. Default: "ethereum,bsc"' },
              ]} />
              <CodeBlock lang="http">{`GET /v1/account/0x1a2b...ef12/portfolio?chains=ethereum,bsc`}</CodeBlock>
            </Section>

            <Section title="Response">
              <CodeBlock lang="json">{`{
  "success": true,
  "data": {
    "address": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    "chains": [
      {
        "chain": "ethereum",
        "native": {
          "address": "0x0000000000000000000000000000000000000000",
          "symbol": "ETH",
          "name": "Ethereum",
          "decimals": 18,
          "balance": "1.234567",
          "balance_raw": "1234567000000000000",
          "price_usd": "2980.50",
          "value_usd": "3680.19"
        },
        "tokens": [
          {
            "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "symbol": "USDC",
            "name": "USD Coin",
            "decimals": 6,
            "balance": "5000.00",
            "balance_raw": "5000000000",
            "price_usd": "1.00",
            "value_usd": "5000.00",
            "logo": "https://static.alchemyapi.io/images/assets/3408.png"
          }
        ],
        "total_value_usd": "8680.19"
      },
      {
        "chain": "bsc",
        "native": { "symbol": "BNB", "balance": "2.5", "value_usd": "1537.50" },
        "tokens": [],
        "total_value_usd": "1537.50"
      }
    ],
    "total_value_usd": "10217.69"
  }
}`}</CodeBlock>
            </Section>

            <Section title="Notes">
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li className="flex gap-2"><span className="text-zinc-600 shrink-0">·</span>ERC-20 token enumeration on Ethereum uses Alchemy. BSC token list returns empty until BSCScan integration is added.</li>
                <li className="flex gap-2"><span className="text-zinc-600 shrink-0">·</span>Tokens with zero balance are filtered out. Results are sorted by USD value descending.</li>
                <li className="flex gap-2"><span className="text-zinc-600 shrink-0">·</span>Prices are fetched from CoinGecko with a 5-minute Redis cache. <code className="inline-code">value_usd</code> is null for tokens without a known price.</li>
                <li className="flex gap-2"><span className="text-zinc-600 shrink-0">·</span>Portfolio results are cached for 5 minutes per address+chains combination.</li>
              </ul>
            </Section>
          </div>

          {/* ── GET /v1/account/:address/activity ── */}
          <div id="activity">
            <EndpointHeader method="GET" path="/v1/account/:address/activity" badge="Coming Soon" />

            <Section title="Description">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Returns a paginated list of decoded transactions for an address, sorted by
                block time descending. Each item is the same shape as a <code className="inline-code">/tx/decode</code> response.
              </p>
            </Section>

            <Section title="Query Parameters">
              <ParamTable rows={[
                { name: 'chains', type: 'string', req: false, desc: 'Comma-separated. Default: "ethereum,bsc"' },
                { name: 'limit', type: 'number', req: false, desc: 'Results per page (1–100). Default: 20' },
                { name: 'cursor', type: 'string', req: false, desc: 'Pagination cursor from previous response' },
                { name: 'type', type: 'TransactionType', req: false, desc: 'Filter by transaction type' },
              ]} />
            </Section>

            <Section title="Response Shape">
              <CodeBlock lang="json">{`{
  "success": true,
  "data": {
    "items": [ /* DecodedTransaction[] */ ],
    "cursor": "eyJibG9jayI6MjE5MzY2MjAsImluZGV4IjoxMn0",
    "has_more": true
  }
}`}</CodeBlock>
            </Section>
          </div>

          {/* ── Types ──────────────────────────────── */}
          <Section id="types" title="Data Types">

            <h3 className="text-sm font-semibold text-white mt-6 mb-3">TransactionType</h3>
            <Table
              headers={['Value', 'Description']}
              rows={[
                ['swap', 'Token swap via DEX'],
                ['transfer', 'Native or ERC-20 token transfer'],
                ['liquidity_add', 'Adding liquidity to a pool'],
                ['liquidity_remove', 'Removing liquidity from a pool'],
                ['borrow', 'Borrowing from a lending protocol'],
                ['repay', 'Repaying a loan'],
                ['stake', 'Staking tokens'],
                ['nft_mint', 'Minting an NFT'],
                ['nft_transfer', 'Transferring an NFT'],
                ['contract_deploy', 'Deploying a contract'],
                ['contract_interaction', 'Generic contract call'],
                ['unknown', 'Could not determine type'],
              ]}
            />

            <h3 className="text-sm font-semibold text-white mt-8 mb-3">DecodeMethod</h3>
            <Table
              headers={['Value', 'Description']}
              rows={[
                ['known_abi', 'Decoded using a bundled ABI for a known protocol address'],
                ['four_byte', 'Function signature resolved via 4byte.directory'],
                ['event_only', 'No input decode; assets reconstructed from ERC-20 Transfer logs'],
                ['raw', 'No decode possible; raw transaction data only'],
              ]}
            />

            <h3 className="text-sm font-semibold text-white mt-8 mb-3">AssetAmount</h3>
            <FieldTable rows={[
              { field: 'address', type: 'string', desc: '0x0000...0000 for native token, contract address for ERC-20' },
              { field: 'symbol', type: 'string', desc: 'Token ticker (ETH, USDC, etc.)' },
              { field: 'decimals', type: 'number', desc: 'Token decimal places' },
              { field: 'amount', type: 'string', desc: 'Human-readable amount (formatUnits applied)' },
              { field: 'amount_raw', type: 'string', desc: 'Raw integer amount as decimal string' },
              { field: 'amount_usd', type: 'string | undefined', desc: 'USD equivalent at time of decode' },
            ]} />
          </Section>

          {/* ── Chains ─────────────────────────────── */}
          <Section id="chains" title="Supported Chains">
            <Table
              headers={['Chain', 'ID', 'Native', 'RPC Provider', 'Token Enumeration']}
              rows={[
                ['Ethereum', 'ethereum', 'ETH', 'Alchemy', '✓ via alchemy_getTokenBalances'],
                ['BNB Chain', 'bsc', 'BNB', 'QuickNode / Public', '— (coming via BSCScan)'],
              ]}
            />
          </Section>

          {/* ── Protocols ──────────────────────────── */}
          <Section id="protocols" title="Supported Protocols">
            <Table
              headers={['ID', 'Chain', 'Contracts']}
              rows={[
                ['uniswap-v3', 'Ethereum', 'SwapRouter, SwapRouter02'],
                ['uniswap-universal', 'Ethereum', 'UniversalRouter v1 & v2'],
                ['uniswap-v2', 'Ethereum', 'UniswapV2Router02'],
                ['pancakeswap-v2', 'BSC', 'PancakeRouter'],
                ['pancakeswap-v3', 'BSC', 'SmartRouter'],
                ['aave-v3', 'Ethereum', 'Pool (handler in progress)'],
              ]}
            />
            <p className="text-zinc-600 text-xs mt-3">
              Unknown protocols fall back to event-only decode using ERC-20 Transfer logs.
            </p>
          </Section>

        </main>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="block text-zinc-500 hover:text-zinc-300 transition-colors py-0.5 text-sm">
      {children}
    </a>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        {id && (
          <a href={`#${id}`} className="text-zinc-700 hover:text-zinc-500 transition-colors text-base">#</a>
        )}
        {title}
      </h2>
      {children}
    </div>
  );
}

function EndpointHeader({ method, path, badge }: { method: string; path: string; badge?: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-500/20 text-green-400 border-green-500/30',
    POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className={`text-xs font-bold px-2.5 py-1 rounded border font-mono ${colors[method] ?? ''}`}>
        {method}
      </span>
      <code className="text-white font-mono text-base">{path}</code>
      {badge && (
        <span className="text-[10px] font-medium text-zinc-600 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full ml-1">
          {badge}
        </span>
      )}
    </div>
  );
}

function CodeBlock({ children, lang }: { children: string; lang: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      {lang && (
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wide">{lang}</span>
        </div>
      )}
      <pre className="px-4 py-4 text-xs text-zinc-300 font-mono leading-relaxed overflow-x-auto whitespace-pre">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 text-xs ${j === 0 ? 'font-mono text-zinc-200' : 'text-zinc-400'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamTable({ rows }: {
  rows: { name: string; type: string; req: boolean; desc: string }[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden text-sm mb-4">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            {['Parameter', 'Type', 'Required', 'Description'].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((r) => (
            <tr key={r.name} className="hover:bg-zinc-900/50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-200">{r.name}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-violet-400">{r.type}</td>
              <td className="px-4 py-2.5 text-xs">
                {r.req
                  ? <span className="text-red-400">required</span>
                  : <span className="text-zinc-600">optional</span>}
              </td>
              <td className="px-4 py-2.5 text-xs text-zinc-400">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldTable({ rows }: {
  rows: { field: string; type: string; desc: string }[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            {['Field', 'Type', 'Description'].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((r) => (
            <tr key={r.field} className="hover:bg-zinc-900/50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-200">{r.field}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-violet-400">{r.type}</td>
              <td className="px-4 py-2.5 text-xs text-zinc-400">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
