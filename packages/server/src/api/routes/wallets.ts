import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { countWallets, getOrCreateDefaultWallet, withUserLock } from '@vetor-wallet/portfolio-core';
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

    // T-065: "checar depois agir" (countWallets → getOrCreateDefaultWallet)
    // precisa ser atômico por usuário — sem o lock, dois POSTs simultâneos
    // do mesmo usuário passavam os dois pela checagem de countWallets antes
    // de qualquer INSERT, e os dois criavam carteira (violando T-050).
    const outcome = await withUserLock(userId, async () => {
      if ((await countWallets(userId)) > 0) {
        return { conflict: true as const };
      }

      const walletId = await getOrCreateDefaultWallet(userId, {
        name: name.trim(),
        description,
        color,
      });

      // T-065: re-SELECT também filtrado por user_id (mesmo padrão do
      // re-SELECT de operations/alerts) — walletId vem do próprio
      // getOrCreateDefaultWallet deste request, seguro na prática, mas o
      // filtro fecha o mesmo descuido.
      const row = await db.execute({
        sql: 'SELECT * FROM wallets WHERE id = ? AND user_id = ?',
        args: [walletId, userId],
      });

      const wallet = row.rows[0];
      if (!wallet) {
        throw new Error(`wallet ${walletId} not found right after getOrCreateDefaultWallet`);
      }

      return { conflict: false as const, wallet };
    });

    if (outcome.conflict) {
      res.status(400).json({ error: 'Você já tem uma carteira de ações' });
      return;
    }

    res.status(201).json(outcome.wallet);
  }),
);

// DELETE /api/wallets/:id foi removido na T-050 — com carteira única não há o que
// apagar (e a FK de operations impediria apagar uma carteira com histórico).

export default router;
