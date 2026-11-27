import { Router, Request, Response } from 'express';
import { BrapiStatusError, fetchDailyHistory, getMarketUniverse } from '@vetor-wallet/brapi-core';
import { rankMarketMovers } from '@vetor-wallet/portfolio-core';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { MarketTodayResponse, TickerHistory } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

/**
 * "Mercado hoje": top 5 altas, baixas e mais negociadas da B3 (só dado, sem
 * opinião). Fonte: `/quote/list` da brapi (grátis, sem token, com atraso) via
 * cache de 15 min. Dado de mercado é global — não há filtro por `user_id`.
 * Brapi fora e sem cache → 502 (o web mostra estado de erro).
 */
router.get(
  '/today',
  asyncHandler(async (_req: Request, res: Response) => {
    let universe;
    try {
      universe = await getMarketUniverse();
    } catch {
      res.status(502).json({ error: 'Cotações de mercado indisponíveis no momento' });
      return;
    }
    const body: MarketTodayResponse = {
      ...rankMarketMovers(universe.quotes),
      asOf: new Date(universe.fetchedAt).toISOString(),
    };
    res.json(body);
  })
);

/** Ticker da B3 (`PETR4`, `TAEE11`, `BOVA11`) ou índice com `^` (`^BVSP`). */
const TICKER_RE = /^\^?[A-Z0-9]{1,12}$/;

/**
 * Histórico diário (3 meses) de UM ticker, para os minigráficos e o gráfico
 * expandido de `/investimentos/acoes`. Dado global (sem `user_id`). O custo de
 * cota fica no `brapi-core`: cache de 12 h por ticker, compartilhado entre
 * usuários, e fila global (nunca 2 chamadas à brapi em voo) — N visitas custam
 * ~1-2 requisições por ticker por dia, não N. `Cache-Control` privado de 1 h
 * poupa até a ida ao nosso servidor ao voltar à página.
 * 400 ticker malformado (não vai à brapi) · 404 brapi sem o ticker (400/404
 * dela, que não consomem cota) · 502 brapi fora.
 */
router.get(
  '/history/:ticker',
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = String(req.params.ticker ?? '').toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      res.status(400).json({ error: 'Ticker inválido' });
      return;
    }
    let history: TickerHistory;
    try {
      history = await fetchDailyHistory(ticker);
    } catch (err) {
      if (err instanceof BrapiStatusError && (err.status === 400 || err.status === 404)) {
        res.status(404).json({ error: 'Histórico indisponível para este ativo' });
        return;
      }
      res.status(502).json({ error: 'Histórico de preços indisponível no momento' });
      return;
    }
    res.set('Cache-Control', 'private, max-age=3600');
    res.json(history);
  })
);

export default router;
