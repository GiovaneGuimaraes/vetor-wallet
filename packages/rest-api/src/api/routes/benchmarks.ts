import { Router, Request, Response } from 'express';
import {
  fetchCDIAccumulated,
  fetchCdiSeries,
  fetchIbovespaReturn,
  fetchIbovespaSeries,
  getPortfolioReturnAndEarliestDate,
} from '@vetor-wallet/insights-core';
import { buildDateWindow, getBRTDate } from '@vetor-wallet/portfolio-core';
import { parseDaysParam } from '@vetor-wallet/validation-core';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { BenchmarkData, BenchmarkHistoryResponse } from '@vetor-wallet/shared';

const router = Router();

// Mesmos limites de janela de `GET /api/portfolio/history` — as duas séries
// são desenhadas no MESMO gráfico (T-068), então divergir aqui deixaria o
// front pedir uma janela válida para uma rota e inválida para a outra.
const DEFAULT_HISTORY_DAYS = 90;
const MAX_HISTORY_DAYS = 365;
const historyDaysError = `days inválido (use um inteiro entre 1 e ${MAX_HISTORY_DAYS})`;

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const today = new Date().toISOString().split('T')[0];
    const { pct: portfolioPct, earliestDate } = await getPortfolioReturnAndEarliestDate(userId);

    if (!earliestDate) {
      const result: BenchmarkData = {
        period: { from: today, to: today },
        portfolio: null,
        cdi: null,
        ibovespa: null,
      };
      res.json(result);
      return;
    }

    const [cdi, ibovespa] = await Promise.all([
      fetchCDIAccumulated(earliestDate, today),
      fetchIbovespaReturn(earliestDate),
    ]);

    const result: BenchmarkData = {
      period: { from: earliestDate, to: today },
      portfolio: portfolioPct,
      cdi,
      ibovespa,
    };

    res.json(result);
  })
);

/**
 * T-068 — séries diárias de CDI/Ibovespa para a comparação no gráfico de
 * evolução da carteira. Diferente de `GET /` (um número por benchmark, o
 * acumulado do período INTEIRO da carteira), aqui vem uma linha por
 * benchmark cobrindo a MESMA janela `?days=` do `/api/portfolio/history`,
 * ancorada na mesma data BRT de "hoje" — é o que permite comparar ponto a
 * ponto no mesmo desenho.
 *
 * A normalização base-100 / conversão para reais é do CLIENTE: só ele sabe a
 * janela exibida e o valor da carteira no primeiro dia comparável.
 *
 * Não depende de nenhuma tabela do usuário (CDI e Ibovespa são globais), mas
 * segue atrás de `requireAuth` como todas as rotas de dados do app.
 */
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseDaysParam(req.query.days, DEFAULT_HISTORY_DAYS, MAX_HISTORY_DAYS);
    if (days === null) {
      res.status(400).json({ error: historyDaysError });
      return;
    }

    const to = getBRTDate().toISOString().split('T')[0];
    const from = buildDateWindow(to, days)[0];

    // Uma fonte indisponível não impede a outra de aparecer — cada `fetch*`
    // já devolve `null` em falha (mesma política de `quotesUnavailable`).
    const [cdi, ibovespa] = await Promise.all([
      fetchCdiSeries(from, to),
      fetchIbovespaSeries(from, to, days),
    ]);

    const result: BenchmarkHistoryResponse = { period: { from, to }, cdi, ibovespa };
    res.json(result);
  })
);

export default router;
