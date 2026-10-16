import type { PositionEntry } from './types';

/**
 * P&L do dia da carteira (variação frente ao fechamento anterior).
 *
 * Só contam tickers com posição positiva. Devolve os dois campos `null` quando:
 * - a busca de cotações falhou, ou
 * - não há ticker ativo, ou
 * - algum ticker ativo não tem cotação atual OU snapshot de fechamento
 *   anterior (T-016: "sem snapshot → campo null").
 */
export function computeDayProfitLoss(
  positionMap: Map<string, PositionEntry>,
  currentQuotes: Map<string, number>,
  previousCloses: Map<string, number>,
  quotesFailed = false
): { dayProfitLoss: number | null; dayProfitLossPct: number | null } {
  if (quotesFailed) return { dayProfitLoss: null, dayProfitLossPct: null };

  const activeTickers: string[] = [];
  for (const [ticker, pos] of positionMap.entries()) {
    if (pos.quantity > 0) activeTickers.push(ticker);
  }
  if (activeTickers.length === 0) return { dayProfitLoss: null, dayProfitLossPct: null };

  let previousValue = 0;
  let currentValue = 0;

  for (const ticker of activeTickers) {
    const pos = positionMap.get(ticker)!;
    const previousClose = previousCloses.get(ticker);
    const currentPrice = currentQuotes.get(ticker);
    if (previousClose === undefined || currentPrice === undefined) {
      return { dayProfitLoss: null, dayProfitLossPct: null };
    }
    previousValue += pos.quantity * previousClose;
    currentValue += pos.quantity * currentPrice;
  }

  const dayProfitLoss = currentValue - previousValue;
  const dayProfitLossPct = previousValue > 0 ? (dayProfitLoss / previousValue) * 100 : null;
  return { dayProfitLoss, dayProfitLossPct };
}
