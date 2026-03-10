import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ApiError } from '../../types/transaction.types.js';

export const txDecodeSchema = z.object({
  hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid transaction hash — must be 0x followed by 64 hex chars'),
  chain: z.enum(['ethereum', 'bsc', 'arbitrum', 'polygon', 'base', 'optimism', 'avalanche'] as [string, ...string[]]).transform((v) => v as 'ethereum' | 'bsc' | 'arbitrum' | 'polygon' | 'base' | 'optimism' | 'avalanche'),
});

export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const error: ApiError = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map((e) => e.message).join('; '),
        },
      };
      res.status(400).json(error);
      return;
    }
    req.body = result.data;
    next();
  };
}
