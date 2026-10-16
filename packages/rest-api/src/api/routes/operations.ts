import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import {
  buildPositionMap,
  getOrCreateDefaultWallet,
  wouldExceedPosition,
} from '@vetor-wallet/portfolio-core';
import {
  createOperation,
  deleteOperation,
  listOperations,
  listOperationsByTicker,
} from '@vetor-wallet/operations-core';
import {
  isValidIsoDate,
  isValidMoneyAmount,
  moneyAmountError,
} from '@vetor-wallet/validation-core';
import type { NewOperation } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

// Carteira única (T-050): o escopo é o USUÁRIO. `?walletId=` é ignorado —
// a lista é sempre consolidada, inclusive sobre carteiras legadas.
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    res.json(await listOperations({ db, userId }));
  })
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
      res.status(400).json({ error: moneyAmountError(price, 'price') });
      return;
    }
    if (!date || !isValidIsoDate(date)) {
      res.status(400).json({ error: 'date invalida (use YYYY-MM-DD)' });
      return;
    }

    const tickerUp = ticker.trim().toUpperCase();

    if (type === 'SELL') {
      // A posição é a de HOJE, não a da DATA da venda — um SELL retroativo é
      // validado contra o consolidado atual. É um bug conhecido (T-021 do
      // `TODO-HUMANO.md`), preservado de propósito nesta extração: corrigi-lo
      // aqui esconderia uma mudança de comportamento dentro de um refactor.
      const existing = await listOperationsByTicker({ db, userId, ticker: tickerUp });
      const positionMap = buildPositionMap(existing);
      if (wouldExceedPosition(positionMap, tickerUp, quantity)) {
        res.status(400).json({ error: 'venda maior que a posicao atual' });
        return;
      }
    }

    const walletId = await getOrCreateDefaultWallet({ db, userId });

    const operation = await createOperation({
      db,
      userId,
      walletId,
      ticker: tickerUp,
      type,
      quantity,
      price,
      date,
    });
    res.status(201).json(operation);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    if (!(await deleteOperation({ db, userId, id }))) {
      res.status(404).json({ error: 'Operacao nao encontrada' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
