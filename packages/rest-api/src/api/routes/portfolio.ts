import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { fetchQuotes } from '@vetor-wallet/brapi-core';
import { listOperationsChronological } from '@vetor-wallet/operations-core';
import {
  buildDateWindow,
  buildPortfolioHistory,
  buildPortfolioSummary,
  buildPositionMap,
  getBRTDate,
  getPreviousCloseSnapshots,
  listSnapshotPointsForWindow,
} from '@vetor-wallet/portfolio-core';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { createSqliteQuery } from '../sqliteQuery';
import { parseDaysParam } from '@vetor-wallet/validation-core';

const router = Router();

// `operations-core` fala `Query` (T-114); `portfolio-core` ainda fala `Db`
// direto (fatia futura da migração) — as duas convivem aqui porque esta rota
// cruza os dois cores.
const query = createSqliteQuery(db);

const DEFAULT_HISTORY_DAYS = 90;
const MAX_HISTORY_DAYS = 365;
const historyDaysError = `days inválido (use um inteiro entre 1 e ${MAX_HISTORY_DAYS})`;

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    // Carteira única (T-050): `?walletId=` é ignorado — o P&L é sempre o
    // consolidado do usuário, inclusive sobre carteiras legadas.
    const ops = await listOperationsChronological({ query, userId });

    const positionMap = buildPositionMap(ops);

    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const { quotes, failed } = await fetchQuotes(activeTickers);

    const todayISO = getBRTDate().toISOString().split('T')[0];
    const previousCloses = await getPreviousCloseSnapshots({
      db,
      tickers: activeTickers,
      beforeDateISO: todayISO,
    });

    const summary = buildPortfolioSummary(positionMap, quotes, failed, previousCloses);

    res.json(summary);
  })
);

// T-058a: série histórica valor × custo, um ponto por dia da janela. Precisa
// vir depois de `GET /` (não há `/:id` neste router, então não há conflito de
// rota — mas mantém a ordem óbvia de leitura).
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const rawDays = req.query.days;

    // Regra de parse compartilhada com `GET /api/benchmarks/history` (T-068).
    const days = parseDaysParam(rawDays, DEFAULT_HISTORY_DAYS, MAX_HISTORY_DAYS);
    if (days === null) {
      res.status(400).json({ error: historyDaysError });
      return;
    }

    // Mesma âncora de "hoje" usada pelo P&L do dia em `GET /` — data BRT, não UTC.
    const endDate = getBRTDate().toISOString().split('T')[0];
    const dates = buildDateWindow(endDate, days);

    const ops = await listOperationsChronological({ query, userId, until: endDate });

    // O isolamento por usuário mora aqui, nas operações: `quote_snapshots` não
    // tem `user_id` (preço de fechamento é global) e só é consultada para os
    // tickers que o próprio usuário já operou. O piso de data da consulta
    // (T-063) vive em `listSnapshotPointsForWindow`.
    const tickers = [...new Set(ops.map((op) => op.ticker))];
    const snapshots = await listSnapshotPointsForWindow({
      db,
      tickers,
      windowStart: dates[0],
      endDate,
    });

    res.json({ points: buildPortfolioHistory(ops, snapshots, dates) });
  })
);

export default router;
