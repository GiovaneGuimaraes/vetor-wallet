import type { MarketQuote, MarketTodayResponse } from '@vetor-wallet/shared';

/**
 * Piso de liquidez: volume financeiro do dia (`close × volume`) de R$ 5 mi.
 * Sem ele o topo de altas/baixas é dominado por micos de dois negócios no dia.
 * Escolha de produto da fatia "Mercado hoje" — ajustar aqui, em um lugar só.
 */
export const MIN_TRADED_VALUE_BRL = 5_000_000;
/** Cotação mínima: tira penny stocks e papéis de direito/recibo ("…6L"). */
export const MIN_PRICE_BRL = 1;
export const MOVERS_LIMIT = 5;

type Ranked = Pick<MarketTodayResponse, 'gainers' | 'losers' | 'mostTraded' | 'minTradedValue'>;

const tradedValue = (q: MarketQuote): number => q.close * q.volume;

/**
 * Separa as maiores altas, maiores baixas e mais negociadas do dia. Só dado de
 * mercado, sem opinião: o único critério próprio é o piso de liquidez acima
 * (e `marketCap` conhecido — papel sem valor de mercado não é ação listada
 * comum). Alta exige `change > 0`, baixa `change < 0`: dia sem alta não lista
 * ativo estável como "maior alta". Empate desempata por ticker (ordem estável).
 */
export function rankMarketMovers(universe: MarketQuote[], limit: number = MOVERS_LIMIT): Ranked {
  const liquid = universe.filter(
    (q) =>
      q.marketCap !== null && q.close >= MIN_PRICE_BRL && tradedValue(q) >= MIN_TRADED_VALUE_BRL
  );
  const top = (cmp: (a: MarketQuote, b: MarketQuote) => number, pool: MarketQuote[]) =>
    [...pool].sort((a, b) => cmp(a, b) || a.ticker.localeCompare(b.ticker)).slice(0, limit);

  return {
    gainers: top(
      (a, b) => b.change - a.change,
      liquid.filter((q) => q.change > 0)
    ),
    losers: top(
      (a, b) => a.change - b.change,
      liquid.filter((q) => q.change < 0)
    ),
    mostTraded: top((a, b) => tradedValue(b) - tradedValue(a), liquid),
    minTradedValue: MIN_TRADED_VALUE_BRL,
  };
}
