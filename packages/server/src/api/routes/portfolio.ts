import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { fetchQuotes } from '../services/quotes';
import { buildPositionMap, buildPortfolioSummary } from '../services/portfolio';
import { getPreviousCloseSnapshots, getBRTDate } from '../services/snapshots';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { Operation } from '@vetor-wallet/shared';
import {
  buildDateWindow,
  buildPortfolioHistory,
  type SnapshotPoint,
} from '../services/portfolioHistory';
import { parseDaysParam } from '../services/dates';

const router = Router();

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
    const result = await db.execute({
      sql: 'SELECT * FROM operations WHERE user_id = ? ORDER BY date ASC, created_at ASC',
      args: [userId],
    });
    const ops = result.rows as unknown as Operation[];

    const positionMap = buildPositionMap(ops);

    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const { quotes, failed } = await fetchQuotes(activeTickers);

    const todayISO = getBRTDate().toISOString().split('T')[0];
    const previousCloses = await getPreviousCloseSnapshots(activeTickers, todayISO);

    const summary = buildPortfolioSummary(positionMap, quotes, failed, previousCloses);

    res.json(summary);
  }),
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

    const opsResult = await db.execute({
      sql: `SELECT * FROM operations
            WHERE user_id = ? AND date <= ?
            ORDER BY date ASC, created_at ASC`,
      args: [userId, endDate],
    });
    const ops = opsResult.rows as unknown as Operation[];

    // O isolamento por usuário mora aqui, nas operações: `quote_snapshots` não
    // tem `user_id` (preço de fechamento é global) e só é consultada para os
    // tickers que o próprio usuário já operou.
    const tickers = [...new Set(ops.map((op) => op.ticker))];

    let snapshots: SnapshotPoint[] = [];
    if (tickers.length > 0) {
      // Piso de data (T-063): a query não trafega mais o histórico inteiro do
      // ticker — só as linhas DENTRO da janela + uma linha de BASE por ticker
      // (o último fechamento conhecido antes dela), que é o que o
      // forward-fill do primeiro dia da janela precisa. Sem o piso, a coleta
      // diária ligada na T-058a/T-061 faz `quote_snapshots` crescer sem
      // limite e cada request de histórico voltaria a ler a tabela inteira.
      const windowStart = dates[0];
      const placeholders = tickers.map(() => '?').join(',');

      const snapResult = await db.execute({
        sql: `SELECT ticker, date(captured_at) AS date, price FROM quote_snapshots
              WHERE ticker IN (${placeholders}) AND date(captured_at) >= ? AND date(captured_at) <= ?
              ORDER BY captured_at ASC`,
        args: [...tickers, windowStart, endDate],
      });

      // Base do forward-fill: por ticker, o fechamento mais recente ANTERIOR
      // ao início da janela (estritamente `<`, para não duplicar uma linha já
      // trazida pela query acima quando ela cai exatamente em `windowStart`).
      const baseResult = await db.execute({
        sql: `SELECT q.ticker AS ticker, date(q.captured_at) AS date, q.price AS price
              FROM quote_snapshots q
              INNER JOIN (
                SELECT ticker, MAX(date(captured_at)) AS max_date
                FROM quote_snapshots
                WHERE ticker IN (${placeholders}) AND date(captured_at) < ?
                GROUP BY ticker
              ) latest ON latest.ticker = q.ticker AND latest.max_date = date(q.captured_at)`,
        args: [...tickers, windowStart],
      });

      snapshots = [...baseResult.rows, ...snapResult.rows].map((row) => ({
        ticker: String(row.ticker),
        date: String(row.date),
        price: Number(row.price),
      }));
    }

    res.json({ points: buildPortfolioHistory(ops, snapshots, dates) });
  }),
);

export default router;
