import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { txRoutes } from './routes/tx.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { addressRoutes } from './routes/address.routes.js';
import { alertRoutes } from './routes/alert.routes.js';
import { priceRoutes } from './routes/price.routes.js';
import { webhookRoutes } from './routes/webhook.routes.js';
import { entityRoutes } from './routes/entity.routes.js';
import { statsRoutes } from './routes/stats.routes.js';
import { smartMoneyRoutes } from './routes/smartmoney.routes.js';
import { alertRulesRoutes } from './routes/alertrules.routes.js';
import { graphRoutes } from './routes/graph.routes.js';
import { apiKeyMiddleware } from './middleware/apiKey.js';
import type { ApiError } from '../types/transaction.types.js';

export function createServer(): express.Application {
  const app = express();

  // CORS — allow frontend dev server and any configured origin
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowed = [
      'http://localhost:3001',
      'http://localhost:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    const origin = req.headers.origin ?? '';
    if (allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Api-Key,X-Request-Id');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Request ID middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.headers['x-request-id'] =
      req.headers['x-request-id'] ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
  });

  // API v1 routes — optional API key auth (required in production)
  app.use('/v1', apiKeyMiddleware);
  app.use('/v1/tx', txRoutes);
  app.use('/v1/account', accountRoutes);
  app.use('/v1/address', addressRoutes);
  app.use('/v1/alerts', alertRoutes);
  app.use('/v1/price', priceRoutes);
  app.use('/v1/stats', statsRoutes);
  app.use('/v1/webhooks', webhookRoutes);
  app.use('/v1/entity', entityRoutes);
  app.use('/v1/smart-money', smartMoneyRoutes);
  app.use('/v1/alert-rules', alertRulesRoutes);
  app.use('/v1/address', graphRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    const error: ApiError = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    };
    res.status(404).json(error);
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err.message, err.stack);
    const error: ApiError = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
      },
    };
    res.status(500).json(error);
  });

  return app;
}
