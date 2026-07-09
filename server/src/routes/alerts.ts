import { Router, Request, Response } from 'express';
import { db } from '../db';
import type { NewAlertRule } from '@vetor-wallet/shared';

const router = Router();

const VALID_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PCT', 'ALLOCATION_PCT'];

router.get('/', async (_req: Request, res: Response) => {
  const result = await db.execute('SELECT * FROM alert_rules ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post('/', async (req: Request, res: Response) => {
  const { ticker, type, threshold } = req.body as Partial<NewAlertRule>;

  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
    res.status(400).json({ error: 'ticker obrigatório' });
    return;
  }
  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
    return;
  }
  if (threshold === undefined || typeof threshold !== 'number' || threshold <= 0) {
    res.status(400).json({ error: 'threshold deve ser maior que 0' });
    return;
  }

  const insert = await db.execute({
    sql: 'INSERT INTO alert_rules (ticker, type, threshold) VALUES (?, ?, ?)',
    args: [ticker.trim().toUpperCase(), type, threshold],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM alert_rules WHERE id = ?',
    args: [Number(newId)],
  });
  res.status(201).json(row.rows[0]);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const check = await db.execute({ sql: 'SELECT id FROM alert_rules WHERE id = ?', args: [id] });
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Regra não encontrada' });
    return;
  }
  await db.execute({ sql: 'DELETE FROM alert_rules WHERE id = ?', args: [id] });
  res.status(204).send();
});

export default router;
