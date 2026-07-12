import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { buildPositionMap, wouldExceedPosition } from '../services/portfolio';
import type { NewOperation, Operation } from '@vetor-wallet/shared';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await db.execute('SELECT * FROM operations ORDER BY date DESC, created_at DESC');
    res.json(result.rows);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
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

    if (type === 'SELL') {
      const existing = await db.execute({
        sql: 'SELECT * FROM operations WHERE ticker = ? ORDER BY date ASC, created_at ASC',
        args: [tickerUp],
      });
      const positionMap = buildPositionMap(existing.rows as unknown as Operation[]);
      if (wouldExceedPosition(positionMap, tickerUp, quantity)) {
        res.status(400).json({ error: 'venda maior que a posicao atual' });
        return;
      }
    }

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
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await db.execute({ sql: 'DELETE FROM operations WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Operacao nao encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
