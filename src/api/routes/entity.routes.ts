import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAddress } from 'viem';
import { entityService } from '../../services/entity/EntityService.js';
import { clusteringService } from '../../services/entity/ClusteringService.js';
import { arkhamService } from '../../services/entity/ArkhamService.js';
import { db } from '../../services/db/Database.js';
import type { ApiError } from '../../types/transaction.types.js';

export const entityRoutes = Router();

const VALID_TYPES   = [
  'exchange','protocol','bridge','fund','whale','mixer','nft','stablecoin',
  'oracle','dao','other','institution','kol','hacker','miner','token','sanctioned',
];
const VALID_CONFS   = ['high','medium','low'];
const SUPPORTED_CHAINS = ['ethereum','bsc','arbitrum','polygon','base','optimism','avalanche','multi'];

// ─── GET /v1/entity/stats ────────────────────────────────────────────────────
entityRoutes.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [byType, bySource, byChain, total] = await Promise.all([
      db.query<{ entity_type: string; cnt: string }>(
        `SELECT entity_type, COUNT(*) AS cnt FROM entities GROUP BY entity_type ORDER BY cnt DESC`
      ),
      db.query<{ source: string; cnt: string }>(
        `SELECT source, COUNT(*) AS cnt FROM entities GROUP BY source ORDER BY cnt DESC`
      ),
      db.query<{ chain: string; cnt: string }>(
        `SELECT chain, COUNT(*) AS cnt FROM entities GROUP BY chain ORDER BY cnt DESC`
      ),
      db.queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM entities`),
    ]);

    return res.json({
      success: true,
      data: {
        total: parseInt(total?.cnt ?? '0', 10),
        by_type:   Object.fromEntries(byType.rows.map((r) => [r.entity_type, parseInt(r.cnt, 10)])),
        by_source: Object.fromEntries(bySource.rows.map((r) => [r.source, parseInt(r.cnt, 10)])),
        by_chain:  Object.fromEntries(byChain.rows.map((r) => [r.chain, parseInt(r.cnt, 10)])),
      },
    });
  } catch (err) {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: 'Database unavailable' } };
    return res.status(503).json(error);
  }
});

// ─── GET /v1/entity/search?q=&type=&chain=&page=&limit= ──────────────────────
entityRoutes.get('/search', async (req: Request, res: Response) => {
  const q     = String(req.query.q ?? '').trim();
  const type  = String(req.query.type ?? '').trim();
  const chain = String(req.query.chain ?? '').trim();
  const page  = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    conditions.push(`(LOWER(label) LIKE $${params.length} OR LOWER(entity_name) LIKE $${params.length} OR address LIKE $${params.length})`);
  }
  if (type && VALID_TYPES.includes(type)) {
    params.push(type);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (chain && SUPPORTED_CHAINS.includes(chain)) {
    params.push(chain);
    conditions.push(`chain = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    params.push(limit, offset);
    const [rows, countRow] = await Promise.all([
      db.query<{
        id: number; address: string; chain: string; label: string;
        entity_name: string; entity_type: string; confidence: string; source: string; tags: string[];
      }>(
        `SELECT id, address, chain, label, entity_name, entity_type, confidence, source, tags
         FROM entities ${where}
         ORDER BY confidence DESC, entity_type, entity_name
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      db.queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM entities ${where}`,
        params.slice(0, params.length - 2)
      ),
    ]);

    return res.json({
      success: true,
      data: {
        items: rows.rows,
        total: parseInt(countRow?.cnt ?? '0', 10),
        page,
        limit,
      },
    });
  } catch {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: 'Database unavailable' } };
    return res.status(503).json(error);
  }
});

// ─── GET /v1/entity/:name/wallets ────────────────────────────────────────────
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

// ─── POST /v1/entity — manual add ────────────────────────────────────────────
entityRoutes.post('/', async (req: Request, res: Response) => {
  const { address, chain = 'ethereum', label, entity_name, entity_type, confidence = 'high', tags = [] } = req.body ?? {};

  if (!address || !isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Valid 0x address required' } };
    return res.status(400).json(error);
  }
  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: 'label is required' } };
    return res.status(400).json(error);
  }
  if (!entity_name || typeof entity_name !== 'string' || entity_name.trim().length === 0) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: 'entity_name is required' } };
    return res.status(400).json(error);
  }
  if (!VALID_TYPES.includes(entity_type)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: `entity_type must be one of: ${VALID_TYPES.join(', ')}` } };
    return res.status(400).json(error);
  }
  if (!SUPPORTED_CHAINS.includes(chain)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: `chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` } };
    return res.status(400).json(error);
  }
  if (!VALID_CONFS.includes(confidence)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: `confidence must be one of: ${VALID_CONFS.join(', ')}` } };
    return res.status(400).json(error);
  }

  try {
    const result = await db.query<{ id: number }>(
      `INSERT INTO entities (address, chain, label, entity_name, entity_type, confidence, source, tags)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)
       ON CONFLICT (address, chain)
         DO UPDATE SET label = EXCLUDED.label, entity_name = EXCLUDED.entity_name,
                       entity_type = EXCLUDED.entity_type, confidence = EXCLUDED.confidence,
                       tags = EXCLUDED.tags, updated_at = NOW()
       RETURNING id`,
      [address.toLowerCase(), chain, label.trim(), entity_name.trim(), entity_type, confidence, tags]
    );
    return res.status(201).json({ success: true, data: { id: result.rows[0].id, address: address.toLowerCase(), chain } });
  } catch {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: 'Failed to save entity' } };
    return res.status(503).json(error);
  }
});

// ─── PUT /v1/entity/:address — update label ───────────────────────────────────
entityRoutes.put('/:address', async (req: Request, res: Response) => {
  const address = String(req.params.address ?? '');
  const chain   = String(req.query.chain ?? 'ethereum').toLowerCase();

  if (!isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Invalid address' } };
    return res.status(400).json(error);
  }

  const { label, entity_name, entity_type, confidence, tags } = req.body ?? {};

  const sets: string[] = [];
  const params: unknown[] = [address.toLowerCase(), chain];

  if (label !== undefined) { params.push(String(label).trim()); sets.push(`label = $${params.length}`); }
  if (entity_name !== undefined) { params.push(String(entity_name).trim()); sets.push(`entity_name = $${params.length}`); }
  if (entity_type !== undefined && VALID_TYPES.includes(entity_type)) { params.push(entity_type); sets.push(`entity_type = $${params.length}`); }
  if (confidence !== undefined && VALID_CONFS.includes(confidence)) { params.push(confidence); sets.push(`confidence = $${params.length}`); }
  if (tags !== undefined && Array.isArray(tags)) { params.push(tags); sets.push(`tags = $${params.length}`); }

  if (sets.length === 0) {
    const error: ApiError = { success: false, error: { code: 'INVALID_PARAMS', message: 'No valid fields to update' } };
    return res.status(400).json(error);
  }

  sets.push(`updated_at = NOW()`);

  try {
    const result = await db.query(
      `UPDATE entities SET ${sets.join(', ')}
       WHERE address = $1 AND chain = $2`,
      params
    );
    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: { code: 'ENTITY_NOT_FOUND', message: 'Entity not found in DB' } });
    }
    return res.json({ success: true, data: { updated: true } });
  } catch {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: 'Update failed' } };
    return res.status(503).json(error);
  }
});

// ─── DELETE /v1/entity/:address?chain= ───────────────────────────────────────
entityRoutes.delete('/:address', async (req: Request, res: Response) => {
  const address = String(req.params.address ?? '');
  const chain   = String(req.query.chain ?? 'ethereum').toLowerCase();

  if (!isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Invalid address' } };
    return res.status(400).json(error);
  }

  try {
    const result = await db.query(
      `DELETE FROM entities WHERE address = $1 AND chain = $2`,
      [address.toLowerCase(), chain]
    );
    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: { code: 'ENTITY_NOT_FOUND', message: 'Entity not found' } });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch {
    const error: ApiError = { success: false, error: { code: 'DB_ERROR', message: 'Delete failed' } };
    return res.status(503).json(error);
  }
});

// ─── POST /v1/entity/cluster/scan — manually trigger clustering ────────────
entityRoutes.post('/cluster/scan', async (_req: Request, res: Response) => {
  try {
    const result = await clusteringService.scan();
    return res.json({ success: true, data: result });
  } catch {
    const error: ApiError = { success: false, error: { code: 'INTERNAL_ERROR', message: 'Scan failed' } };
    return res.status(500).json(error);
  }
});

// ─── GET /v1/entity/arkham/:address — Arkham Intel real-time lookup ───────────
entityRoutes.get('/arkham/:address', async (req: Request, res: Response) => {
  const address = String(req.params.address ?? '');
  if (!isAddress(address)) {
    const error: ApiError = { success: false, error: { code: 'INVALID_ADDRESS', message: 'Valid 0x address required' } };
    return res.status(400).json(error);
  }
  if (!arkhamService.isEnabled) {
    return res.status(503).json({ success: false, error: { code: 'SERVICE_DISABLED', message: 'ARKHAM_API_KEY not configured' } });
  }
  const persist = req.query.persist !== 'false';
  const result = await arkhamService.lookup(address, persist);
  return res.json({ success: true, data: result });
});
