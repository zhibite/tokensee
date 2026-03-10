import { Router } from 'express';
import type { Request, Response } from 'express';
import { entityService } from '../../services/entity/EntityService.js';
import type { ApiError } from '../../types/transaction.types.js';

export const entityRoutes = Router();

// GET /v1/entity/:name/wallets
// Returns all known wallet addresses belonging to a named entity (e.g. Binance, Jump Trading)
entityRoutes.get('/:name/wallets', async (req: Request, res: Response) => {
  const name = String(req.params.name ?? '');

  if (!name || name.trim().length === 0) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: 'Entity name is required' } };
    return res.status(400).json(error);
  }

  const wallets = await entityService.getWalletsByEntity(name.trim());

  if (wallets.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'ENTITY_NOT_FOUND', message: `No wallets found for entity: ${name}` },
    });
  }

  return res.json({
    success: true,
    data: {
      entity_name: wallets[0].entity_name,
      entity_type: wallets[0].entity_type,
      wallet_count: wallets.length,
      wallets,
    },
  });
});
