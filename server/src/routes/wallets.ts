import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { countWallets, getOrCreateDefaultWallet } from '../services/wallets';
import type { NewWallet } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);

// GET /api/wallets — lista as carteiras do usuário; lazy-cria a padrão se nenhuma existir.
// Bases legadas com 2+ carteiras continuam listando todas (T-050).
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    await getOrCreateDefaultWallet(userId);

    const result = await db.execute({
      sql: 'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC, id ASC',
      args: [userId],
    });

    res.json(result.rows);
  }),
);

// POST /api/wallets — carteira única (T-050): só cria se o usuário ainda não tiver nenhuma.
// T-053: reusa getOrCreateDefaultWallet, passando name/description/color do body como
// overrides, para que a carteira já nasça com os dados do body (sem UPDATE depois) e a
// criação também adote operações órfãs (wallet_id IS NULL) — caso raro de usuário legado
// sem carteira que chega aqui em vez de pelo lazy-create do GET.
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { name, description = '', color = '#e3d5b8' } = req.body as NewWallet;

    if (!name?.trim()) {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }

    if ((await countWallets(userId)) > 0) {
      res.status(400).json({ error: 'Você já tem uma carteira de ações' });
      return;
    }

    const walletId = await getOrCreateDefaultWallet(userId, {
      name: name.trim(),
      description,
      color,
    });

    const row = await db.execute({
      sql: 'SELECT * FROM wallets WHERE id = ?',
      args: [walletId],
    });

    const wallet = row.rows[0];
    if (!wallet) {
      throw new Error(`wallet ${walletId} not found right after getOrCreateDefaultWallet`);
    }

    res.status(201).json(wallet);
  }),
);

// DELETE /api/wallets/:id foi removido na T-050 — com carteira única não há o que
// apagar (e a FK de operations impediria apagar uma carteira com histórico).

export default router;
