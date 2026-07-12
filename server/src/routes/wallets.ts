import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewWallet } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);

// GET /api/wallets — lista carteiras do usuário; lazy-cria "Carteira B3 pessoal" se nenhuma existir
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    let result = await db.execute({
      sql: 'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC',
      args: [userId],
    });

    if (result.rows.length === 0) {
      // Lazy migration: criar carteira padrão e adotar operações existentes
      const ins = await db.execute({
        sql: 'INSERT INTO wallets (user_id, name, description, color) VALUES (?, ?, ?, ?)',
        args: [userId, 'Carteira B3 pessoal', 'Ações · longo prazo', '#e3d5b8'],
      });
      const walletId = Number(ins.lastInsertRowid);
      await db.execute({
        sql: 'UPDATE operations SET wallet_id = ? WHERE user_id = ? AND wallet_id IS NULL',
        args: [walletId, userId],
      });
      result = await db.execute({
        sql: 'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC',
        args: [userId],
      });
    }

    res.json(result.rows);
  }),
);

// POST /api/wallets
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { name, description = '', color = '#e3d5b8' } = req.body as NewWallet;

    if (!name?.trim()) {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }

    const ins = await db.execute({
      sql: 'INSERT INTO wallets (user_id, name, description, color) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), description, color],
    });

    const row = await db.execute({
      sql: 'SELECT * FROM wallets WHERE id = ?',
      args: [Number(ins.lastInsertRowid)],
    });

    res.status(201).json(row.rows[0]);
  }),
);

// DELETE /api/wallets/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'DELETE FROM wallets WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId],
    });

    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Carteira não encontrada' });
      return;
    }

    res.status(204).send();
  }),
);

export default router;
