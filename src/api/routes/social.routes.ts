/**
 * Social Identity Routes
 *
 * GET  /v1/address/:address/social
 *   → Returns aggregated social identities for an address
 *   → Sources: ENS, Lens Protocol, Farcaster, entity library
 *
 * POST /v1/address/social/batch
 *   → Batch resolve social profiles for up to 100 addresses
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAddress } from 'viem';
import { socialIdentityService } from '../../services/entity/SocialIdentityService.js';
import type { ApiError } from '../../types/transaction.types.js';

export const socialRoutes = Router();

// ─── GET /v1/address/:address/social ────────────────────────────────────────

socialRoutes.get('/:address/social', async (req: Request, res: Response) => {
  const address = req.params['address'] as string;

  if (!isAddress(address)) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_ADDRESS', message: 'Invalid EVM address' },
    };
    return res.status(400).json(error);
  }

  try {
    const profile = await socialIdentityService.getProfile(address.toLowerCase());

    return res.json({
      success: true,
      data: profile,
    });
  } catch (err) {
    console.error('[social] profile lookup failed:', err);
    const error: ApiError = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch social identities' },
    };
    return res.status(500).json(error);
  }
});

// ─── POST /v1/address/social/batch ──────────────────────────────────────────

socialRoutes.post('/social/batch', async (req: Request, res: Response) => {
  const { addresses } = req.body as { addresses?: unknown };

  if (!Array.isArray(addresses) || addresses.length === 0) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_INPUT', message: '`addresses` must be a non-empty array' },
    };
    return res.status(400).json(error);
  }

  if (addresses.length > 100) {
    const error: ApiError = {
      success: false,
      error: { code: 'TOO_MANY', message: 'Maximum 100 addresses per batch' },
    };
    return res.status(400).json(error);
  }

  const invalid = (addresses as string[]).filter((a) => !isAddress(a));
  if (invalid.length > 0) {
    const error: ApiError = {
      success: false,
      error: { code: 'INVALID_ADDRESS', message: `Invalid addresses: ${invalid.slice(0, 5).join(', ')}` },
    };
    return res.status(400).json(error);
  }

  try {
    const profiles = await socialIdentityService.getBatch(addresses as string[]);

    return res.json({
      success: true,
      data: profiles,
      count: Object.keys(profiles).length,
    });
  } catch (err) {
    console.error('[social] batch lookup failed:', err);
    const error: ApiError = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch social identities' },
    };
    return res.status(500).json(error);
  }
});
