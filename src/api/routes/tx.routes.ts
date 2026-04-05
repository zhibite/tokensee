import { Router } from 'express';
import type { Request, Response } from 'express';
import { validateBody, txDecodeSchema } from '../middleware/validate.middleware.js';
import { decodePipeline } from '../../decoder/pipeline/DecodePipeline.js';
import { CacheService, CACHE_KEYS, TTL } from '../../services/cache/CacheService.js';
import { query } from '../../services/db/Database.js';
import { entityService } from '../../services/entity/EntityService.js';
import type { TxDecodeRequest, TxDecodeResponse, ApiError } from '../../types/transaction.types.js';

// viem returns bigints - serialize safely for JSON responses and cache
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

const router = Router();
const cache = new CacheService();

router.post('/decode', validateBody(txDecodeSchema), async (req: Request, res: Response) => {
  const start = Date.now();
  const { hash, chain } = req.body as TxDecodeRequest;
  const normalizedHash = hash.toLowerCase();

  const cacheKey = CACHE_KEYS.decodedTx(chain, normalizedHash);
  const cached = await cache.get<TxDecodeResponse['data']>(cacheKey);
  if (cached) {
    res.json({ success: true, data: cached, cached: true, decode_latency_ms: Date.now() - start });
    return;
  }

  let decoded;
  try {
    decoded = await decodePipeline.execute({ hash: normalizedHash, chain });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[decode] ${chain}:${normalizedHash} failed:`, message);
    const error: ApiError = { success: false, error: { code: 'DECODE_ERROR', message } };
    res.status(500).json(error);
    return;
  }

  const [senderEntity, contractEntity] = await Promise.all([
    entityService.lookup(decoded.sender, chain),
    decoded.contract_address ? entityService.lookup(decoded.contract_address, chain) : Promise.resolve(null),
  ]);

  const toEntityInfo = (e: typeof senderEntity) =>
    e ? { label: e.label, entity_name: e.entity_name, entity_type: e.entity_type } : null;

  decoded.sender_entity = toEntityInfo(senderEntity);
  decoded.contract_entity = toEntityInfo(contractEntity);

  await cache.set(cacheKey, JSON.parse(safeStringify(decoded)), TTL.DECODED_TX);
  persistToDb(decoded).catch((err) => console.error('DB persist failed:', err));

  const response: TxDecodeResponse = {
    success: true,
    data: decoded,
    cached: false,
    decode_latency_ms: Date.now() - start,
  };

  res.setHeader('Content-Type', 'application/json');
  res.send(safeStringify(response));
});

async function persistToDb(decoded: TxDecodeResponse['data']): Promise<void> {
  await query(
    `INSERT INTO transactions (
      hash, chain, block_number, block_timestamp, sender, to_address, value_wei, status,
      tx_type, protocol_id, summary, function_name, decode_method,
      assets_in, assets_out, gas_used, gas_price_wei, fee_usd, function_args
    ) VALUES (
      $1, $2, $3, to_timestamp($4), $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19
    )
    ON CONFLICT (hash, chain) DO NOTHING`,
    [
      decoded.hash,
      decoded.chain,
      decoded.block_number,
      decoded.timestamp,
      decoded.sender,
      decoded.contract_address,
      decoded.value_wei ?? '0',
      decoded.status ?? 1,
      decoded.type,
      decoded.protocol,
      decoded.summary,
      decoded.function_name,
      decoded.decode_method,
      JSON.stringify(decoded.assets_in),
      JSON.stringify(decoded.assets_out),
      decoded.gas_used,
      decoded.gas_price_wei ?? null,
      decoded.fee_usd,
      decoded.function_args ? JSON.stringify(decoded.function_args) : null,
    ]
  );
}

export { router as txRoutes };
