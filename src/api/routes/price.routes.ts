import { Router } from 'express';
import type { Request, Response } from 'express';
import { priceService } from '../../services/price/PriceService.js';
import type { ApiError } from '../../types/transaction.types.js';

export const priceRoutes = Router();

/**
 * GET /v1/price/current?symbol=ETH,BTC,USDC
 * Returns current USD prices for one or more token symbols.
 */
priceRoutes.get('/current', async (req: Request, res: Response) => {
  const symbolsParam = typeof req.query.symbol === 'string' ? req.query.symbol : '';
  if (!symbolsParam) {
    const error: ApiError = {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'symbol query param required (e.g. ?symbol=ETH,USDC)' },
    };
    return res.status(400).json(error);
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  const results = await Promise.all(
    symbols.map(async (symbol) => ({
      symbol,
      price_usd: await priceService.getPrice(symbol),
    }))
  );

  return res.json({ success: true, data: results });
});

/**
 * GET /v1/price/history?symbol=ETH&timestamp=1709827200
 * Returns the historical USD price of a token at a given Unix timestamp (daily granularity).
 *
 * @param symbol  - Token symbol (e.g. ETH, USDC)
 * @param timestamp - Unix timestamp in seconds
 */
priceRoutes.get('/history', async (req: Request, res: Response) => {
  const symbol    = typeof req.query.symbol    === 'string' ? req.query.symbol.toUpperCase() : '';
  const tsParam   = typeof req.query.timestamp === 'string' ? req.query.timestamp : '';

  if (!symbol || !tsParam) {
    const error: ApiError = {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'Both symbol and timestamp query params are required' },
    };
    return res.status(400).json(error);
  }

  const timestamp = parseInt(tsParam, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_PARAM', message: 'timestamp must be a positive Unix timestamp in seconds' },
    };
    return res.status(400).json(error);
  }

  const priceUsd = await priceService.getPriceAt(symbol, timestamp);

  return res.json({
    success: true,
    data: {
      symbol,
      timestamp,
      price_usd: priceUsd,
    },
  });
});
