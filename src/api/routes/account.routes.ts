import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAddress } from 'viem';
import { portfolioService } from '../../services/portfolio/PortfolioService.js';
import { ensService } from '../../services/ens/EnsService.js';
import { db } from '../../services/db/Database.js';
import type { SupportedChain } from '../../types/chain.types.js';
import type { ApiError } from '../../types/transaction.types.js';

export const accountRoutes = Router();

const SUPPORTED_CHAINS: SupportedChain[] = ['ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche'];

// GET /v1/account/:address/activity?chain=&limit=&cursor=
accountRoutes.get('/:address/activity', async (req: Request, res: Response) => {
  const address = String(req.params.address);
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;
  const limit = Math.min(parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20', 10), 50);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  if (!isAddress(address)) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' },
    };
    return res.status(400).json(error);
  }

  if (chain && !SUPPORTED_CHAINS.includes(chain as SupportedChain)) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_CHAIN', message: `Supported chains: ${SUPPORTED_CHAINS.join(', ')}` },
    };
    return res.status(400).json(error);
  }

  try {
    const values: unknown[] = [address.toLowerCase()];
    const conditions: string[] = ['sender = $1'];
    let idx = 2;

    if (chain) {
      conditions.push(`chain = $${idx++}`);
      values.push(chain);
    }
    if (cursor) {
      conditions.push(`block_timestamp < $${idx++}`);
      values.push(cursor);
    }

    const where = conditions.join(' AND ');
    values.push(limit + 1);

    const result = await db.query(
      `SELECT
        hash, chain, block_number,
        block_timestamp,
        sender, to_address,
        tx_type, protocol_id, summary,
        assets_in, assets_out,
        gas_used, gas_price_wei, fee_usd,
        function_name, decode_method
      FROM transactions
      WHERE ${where}
      ORDER BY block_timestamp DESC
      LIMIT $${idx}`,
      values
    );

    const rows = result.rows;
    const has_more = rows.length > limit;
    const items = has_more ? rows.slice(0, limit) : rows;
    const next_cursor = has_more ? items[items.length - 1].block_timestamp : null;

    return res.json({
      success: true,
      data: {
        items: items.map((r) => ({
          hash: r.hash,
          chain: r.chain,
          block_number: Number(r.block_number),
          timestamp: Math.floor(new Date(r.block_timestamp).getTime() / 1000),
          sender: r.sender,
          contract_address: r.to_address ?? null,
          type: r.tx_type ?? 'unknown',
          protocol: r.protocol_id ?? null,
          summary: r.summary ?? 'Unknown transaction',
          assets_in: r.assets_in ?? [],
          assets_out: r.assets_out ?? [],
          fee_usd: r.fee_usd ? String(r.fee_usd) : null,
          function_name: r.function_name ?? null,
          decode_method: r.decode_method ?? 'raw',
        })),
        cursor: next_cursor,
        has_more,
      },
    });
  } catch (err) {
    const error: ApiError = {
      success: false,
      error: {
        code: 'ACTIVITY_FETCH_FAILED',
        message: process.env.NODE_ENV === 'development'
          ? (err instanceof Error ? err.message : String(err))
          : 'Failed to fetch activity',
      },
    };
    return res.status(500).json(error);
  }
});

// GET /v1/account/:address/portfolio?chains=ethereum,bsc
accountRoutes.get('/:address/portfolio', async (req: Request, res: Response) => {
  const address = String(req.params.address);
  const chainsParam = (typeof req.query.chains === 'string' ? req.query.chains : undefined) ?? 'ethereum,bsc';

  if (!isAddress(address)) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' },
    };
    return res.status(400).json(error);
  }

  const chains = chainsParam
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is SupportedChain => SUPPORTED_CHAINS.includes(c as SupportedChain));

  if (chains.length === 0) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_CHAIN', message: `Supported chains: ${SUPPORTED_CHAINS.join(', ')}` },
    };
    return res.status(400).json(error);
  }

  try {
    const [portfolio, ensName] = await Promise.all([
      portfolioService.getPortfolio(address, chains),
      chains.includes('ethereum') ? ensService.getName(address) : Promise.resolve(null),
    ]);
    return res.json({ success: true, data: { ...portfolio, ens_name: ensName } });
  } catch (err) {
    const error: ApiError = {
      success: false,
      error: {
        code: 'PORTFOLIO_FETCH_FAILED',
        message: process.env.NODE_ENV === 'development'
          ? (err instanceof Error ? err.message : String(err))
          : 'Failed to fetch portfolio',
      },
    };
    return res.status(500).json(error);
  }
});
