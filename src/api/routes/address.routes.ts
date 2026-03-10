import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAddress } from 'viem';
import { entityService } from '../../services/entity/EntityService.js';
import { ensService } from '../../services/ens/EnsService.js';
import type { SupportedChain } from '../../types/chain.types.js';
import type { ApiError } from '../../types/transaction.types.js';

export const addressRoutes = Router();

const SUPPORTED_CHAINS: SupportedChain[] = ['ethereum', 'bsc'];

// GET /v1/address/:address/entity?chain=ethereum
addressRoutes.get('/:address/entity', async (req: Request, res: Response) => {
  const { address } = req.params;
  const chain = ((typeof req.query.chain === 'string' ? req.query.chain : 'ethereum')).toLowerCase() as SupportedChain;

  if (!isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' } };
    return res.status(400).json(error);
  }

  if (!SUPPORTED_CHAINS.includes(chain)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_CHAIN', message: `Supported chains: ${SUPPORTED_CHAINS.join(', ')}` } };
    return res.status(400).json(error);
  }

  const [entity, ensName] = await Promise.all([
    entityService.lookup(address, chain),
    chain === 'ethereum' ? ensService.getName(address) : Promise.resolve(null),
  ]);

  if (!entity && !ensName) {
    return res.status(404).json({
      success: false,
      error: { code: 'ENTITY_NOT_FOUND', message: 'No label found for this address' },
    });
  }

  return res.json({
    success: true,
    data: entity
      ? { ...entity, ens_name: ensName }
      : { address: address.toLowerCase(), chain, ens_name: ensName, label: ensName, entity_name: null, entity_type: null, confidence: null, source: 'ens', tags: [] },
  });
});

// GET /v1/address/:address/ens
addressRoutes.get('/:address/ens', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' } };
    return res.status(400).json(error);
  }

  const ensName = await ensService.getName(address);
  return res.json({ success: true, data: { address: address.toLowerCase(), ens_name: ensName } });
});
