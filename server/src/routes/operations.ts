import { Router, Request, Response } from 'express';
import { db } from '../db';
import type { NewOperation } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const result = await db.execute(
    'SELECT * FROM operations ORDER BY date DESC, created_at DESC'
  );
  res.json(result.rows);
});

router.post('/', async (req: Request, res: Response) => {
  const { ticker, type, quantity, price, date } = req.body as Partial<NewOperation>;

  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
    res.status(400).json({ error: 'ticker e obrigatorio' });
    return;
  }
  if (type !== 'BUY' && type !== 'SELL') {
    res.status(400).json({ error: 'type deve ser BUY ou SELL' });
    return;
  }
  if (!quantity || quantity <= 0) {
    res.status(400).json({ error: 'quantity deve ser maior que 0' });
    return;
  }
  if (!price || price <= 0) {
    res.status(400).json({ error: 'price deve ser maior que 0' });
    return;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date invalida (use YYYY-MM-DD)' });
    return;
  }

  const tickerUp = ticker.trim().toUpperCase();
  const insert = await db.execute({
    sql: 'INSERT INTO operations (ticker, type, quantity, price, date) VALUES (?, ?, ?, ?, ?)',
    args: [tickerUp, type, quantity, price, date],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM operations WHERE id = ?',
    args: [Number(newId)],
  });
  res.status(201).json(row.rows[0]);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const check = await db.execute({ sql: 'SELECT id FROM operations WHERE id = ?', args: [id] });
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Operacao nao encontrada' });
    return;
  }
  await db.execute({ sql: 'DELETE FROM operations WHERE id = ?', args: [id] });
  res.status(204).send();
});

export default router;
