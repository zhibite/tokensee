import { Router } from 'express';
import type { Request, Response } from 'express';
import { alertRulesService } from '../../services/alertrules/AlertRulesService.js';

export const alertRulesRoutes = Router();

// GET /v1/alert-rules
alertRulesRoutes.get('/', async (_req: Request, res: Response) => {
  const rules = await alertRulesService.list();
  res.json({ success: true, data: { items: rules } });
});

// POST /v1/alert-rules
alertRulesRoutes.post('/', async (req: Request, res: Response) => {
  const { name, description, conditions, webhook_id } = req.body as Record<string, unknown>;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'name is required' } });
    return;
  }
  if (!conditions || typeof conditions !== 'object') {
    res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'conditions object is required' } });
    return;
  }

  try {
    const rule = await alertRulesService.create({
      name,
      description: typeof description === 'string' ? description : undefined,
      conditions: conditions as any,
      webhook_id: typeof webhook_id === 'string' ? webhook_id : undefined,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// PATCH /v1/alert-rules/:id
alertRulesRoutes.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  const patch = req.body as Record<string, unknown>;

  const rule = await alertRulesService.update(id, patch as any);
  if (!rule) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    return;
  }
  res.json({ success: true, data: rule });
});

// DELETE /v1/alert-rules/:id
alertRulesRoutes.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  const deleted = await alertRulesService.delete(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    return;
  }
  res.json({ success: true, message: 'Rule deleted' });
});
