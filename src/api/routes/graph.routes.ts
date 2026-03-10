/**
 * GET /v1/address/:address/graph
 *
 * Returns a fund-flow graph for an address: nodes + edges derived from
 * whale_alerts transfers. Up to `depth` hops (default 1, max 2).
 *
 * Response:
 *   { nodes: GraphNode[], edges: GraphEdge[] }
 *
 * GraphNode: { id, address, label, entity_type, is_center, tx_count, volume_usd }
 * GraphEdge: { id, source, target, asset_symbol, volume_usd, tx_count }
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../services/db/Database.js';
import { entityService } from '../../services/entity/EntityService.js';
import type { SupportedChain } from '../../types/chain.types.js';

export const graphRoutes = Router();

interface GraphNode {
  id: string;
  address: string;
  label: string | null;
  entity_name: string | null;
  entity_type: string | null;
  is_center: boolean;
  tx_count: number;
  volume_usd: number;
}

interface GraphEdge {
  id: string;
  source: string;   // address
  target: string;   // address
  asset_symbol: string;
  volume_usd: number;
  tx_count: number;
}

graphRoutes.get('/:address/graph', async (req: Request, res: Response) => {
  const address = String(req.params.address ?? '');
  const chain = typeof req.query.chain === 'string' ? req.query.chain as SupportedChain : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? '60'), 10) || 60, 200);

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' } });
    return;
  }

  const addr = address.toLowerCase();

  try {
    // ── Depth-1: all transfers involving this address ─────────────────
    let query = `
      SELECT from_address, to_address, asset_symbol,
             SUM(amount_usd)::float AS volume_usd,
             COUNT(*)::int          AS tx_count
      FROM whale_alerts
      WHERE (from_address = $1 OR to_address = $1)
    `;
    const args: unknown[] = [addr];
    let argIdx = 2;

    if (chain) {
      query += ` AND chain = $${argIdx++}`;
      args.push(chain);
    }

    query += `
      GROUP BY from_address, to_address, asset_symbol
      ORDER BY volume_usd DESC NULLS LAST
      LIMIT ${limit}
    `;

    const result = await db.query(query, args);
    const rows = result.rows;

    // ── Build node map ────────────────────────────────────────────────
    const nodeMap = new Map<string, GraphNode>();

    const ensureNode = (a: string) => {
      if (!nodeMap.has(a)) {
        nodeMap.set(a, {
          id: a,
          address: a,
          label: null,
          entity_name: null,
          entity_type: null,
          is_center: a === addr,
          tx_count: 0,
          volume_usd: 0,
        });
      }
      return nodeMap.get(a)!;
    };

    const edges: GraphEdge[] = [];

    for (const row of rows) {
      const from = row.from_address as string;
      const to   = row.to_address   as string;
      const vol  = Number(row.volume_usd ?? 0);
      const cnt  = Number(row.tx_count);
      const sym  = row.asset_symbol as string;

      const fromNode = ensureNode(from);
      const toNode   = ensureNode(to);

      // Update stats on the non-center node
      const counterNode = from === addr ? toNode : fromNode;
      counterNode.tx_count  += cnt;
      counterNode.volume_usd += vol;

      edges.push({
        id: `${from}-${to}-${sym}`,
        source: from,
        target: to,
        asset_symbol: sym,
        volume_usd: vol,
        tx_count: cnt,
      });
    }

    // Center node stats = sum of all edges
    const centerNode = ensureNode(addr);
    centerNode.volume_usd = edges.reduce((s, e) => s + e.volume_usd, 0);
    centerNode.tx_count   = edges.reduce((s, e) => s + e.tx_count, 0);

    // ── Enrich nodes with entity labels (parallel) ────────────────────
    const lookupChain = chain ?? 'ethereum';
    await Promise.allSettled(
      [...nodeMap.keys()].map(async (a) => {
        const info = await entityService.lookup(a, lookupChain as SupportedChain).catch(() => null);
        if (info) {
          const node = nodeMap.get(a)!;
          node.label       = info.label;
          node.entity_name = info.entity_name;
          node.entity_type = info.entity_type;
        }
      })
    );

    res.json({
      success: true,
      data: {
        center: addr,
        chain: chain ?? 'all',
        nodes: [...nodeMap.values()].sort((a, b) =>
          a.is_center ? -1 : b.is_center ? 1 : b.volume_usd - a.volume_usd
        ),
        edges,
        total_volume_usd: centerNode.volume_usd,
        total_tx_count:   centerNode.tx_count,
      },
    });
  } catch (err) {
    console.error('[Graph] error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to build graph' } });
  }
});
