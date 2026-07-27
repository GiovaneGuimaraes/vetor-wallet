import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { buildPositionMap, wouldExceedPosition } from '../services/portfolio';
import { isValidIsoDate } from '../services/dates';
import { getOrCreateDefaultWallet } from '../services/wallets';
import { isValidMoneyAmount, moneyDecimalsError } from '../services/money';
import type { NewOperation, Operation } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);

// Carteira única (T-050): o escopo é o USUÁRIO. `?walletId=` é ignorado —
// a lista é sempre consolidada, inclusive sobre carteiras legadas.
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    const result = await db.execute({
      sql: 'SELECT * FROM operations WHERE user_id = ? ORDER BY date DESC, created_at DESC',
      args: [userId],
    });
    res.json(result.rows);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    // `wallet_id` do body é IGNORADO (T-050): a operação sempre nasce na carteira
    // padrão do usuário. Fecha de quebra o buraco de gravar numa carteira alheia.
    const { ticker, type, quantity, price, date } = req.body as Partial<NewOperation>;

    if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
      res.status(400).json({ error: 'ticker e obrigatorio' });
      return;
    }
    if (type !== 'BUY' && type !== 'SELL') {
      res.status(400).json({ error: 'type deve ser BUY ou SELL' });
      return;
    }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: 'quantity deve ser maior que 0' });
      return;
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: 'price deve ser maior que 0' });
      return;
    }
    // T-059: mesmo padrão da T-052 (isValidMoneyAmount), aplicado a price.
    if (!isValidMoneyAmount(price)) {
      res.status(400).json({ error: moneyDecimalsError('price') });
      return;
    }
    if (!date || !isValidIsoDate(date)) {
      res.status(400).json({ error: 'date invalida (use YYYY-MM-DD)' });
      return;
    }

    const tickerUp = ticker.trim().toUpperCase();

    if (type === 'SELL') {
      // Sem filtro de carteira (T-050): a posição é o consolidado do usuário.
      const existing = await db.execute({
        sql: 'SELECT * FROM operations WHERE ticker = ? AND user_id = ? ORDER BY date ASC, created_at ASC',
        args: [tickerUp, userId],
      });
      const positionMap = buildPositionMap(existing.rows as unknown as Operation[]);
      if (wouldExceedPosition(positionMap, tickerUp, quantity)) {
        res.status(400).json({ error: 'venda maior que a posicao atual' });
        return;
      }
    }

    const walletId = await getOrCreateDefaultWallet(userId);

    const insert = await db.execute({
      sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [tickerUp, type, quantity, price, date, userId, walletId],
    });

    const newId = insert.lastInsertRowid ?? 0;
    // Re-SELECT também filtrado por user_id (T-059, simetria com o PATCH — T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM operations WHERE id = ? AND user_id = ?',
      args: [Number(newId), userId],
    });
    res.status(201).json(row.rows[0]);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const result = await db.execute({
      sql: 'DELETE FROM operations WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Operacao nao encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
