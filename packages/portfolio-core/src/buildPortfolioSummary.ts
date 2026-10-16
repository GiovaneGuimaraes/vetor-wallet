import type { Position, PortfolioSummary } from '@vetor-wallet/shared';
import { computeDayProfitLoss } from './computeDayProfitLoss';
import type { PositionEntry } from './types';

/**
 * Resumo da carteira que `GET /api/portfolio` devolve: posições ativas com
 * investido/valor atual/P&L/alocação, os totais e o P&L do dia.
 *
 * Falha de cotação nunca derruba a request: o ticker sem cotação fica com
 * `currentValue`/`profitLoss` `null`, o total vira `null`, a alocação cai para
 * o custo investido e `quotesFailed` vira `quotesUnavailable: true` (T-015).
 */
export function buildPortfolioSummary(
  positionMap: Map<string, PositionEntry>,
  quotes: Map<string, number>,
  quotesFailed = false,
  previousCloses: Map<string, number> = new Map()
): PortfolioSummary {
  const activeTickers: string[] = [];
  for (const [ticker, pos] of positionMap.entries()) {
    if (pos.quantity > 0) activeTickers.push(ticker);
  }

  let totalInvested = 0;
  let totalCurrentValue: number | null = 0;
  const positions: Position[] = [];

  for (const ticker of activeTickers) {
    const pos = positionMap.get(ticker)!;
    const invested = pos.quantity * pos.avgPrice;
    totalInvested += invested;

    const currentPrice = quotes.get(ticker) ?? null;
    const currentValue = currentPrice !== null ? pos.quantity * currentPrice : null;

    if (currentValue !== null && totalCurrentValue !== null) {
      totalCurrentValue += currentValue;
    } else {
      totalCurrentValue = null;
    }

    const profitLoss = currentValue !== null ? currentValue - invested : null;
    const profitLossPct =
      profitLoss !== null && invested > 0 ? (profitLoss / invested) * 100 : null;

    positions.push({
      ticker,
      quantity: pos.quantity,
      avgPrice: pos.avgPrice,
      invested,
      currentPrice,
      currentValue,
      profitLoss,
      profitLossPct,
      allocationPct: null,
    });
  }

  const totalForAlloc = totalCurrentValue ?? totalInvested;
  for (const p of positions) {
    const base = p.currentValue ?? p.invested;
    p.allocationPct = totalForAlloc > 0 ? (base / totalForAlloc) * 100 : null;
  }

  const totalProfitLoss = totalCurrentValue !== null ? totalCurrentValue - totalInvested : null;
  const totalProfitLossPct =
    totalProfitLoss !== null && totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : null;

  const { dayProfitLoss, dayProfitLossPct } = computeDayProfitLoss(
    positionMap,
    quotes,
    previousCloses,
    quotesFailed
  );

  return {
    positions,
    totalInvested,
    totalCurrentValue,
    totalProfitLoss,
    totalProfitLossPct,
    dayProfitLoss,
    dayProfitLossPct,
    ...(quotesFailed ? { quotesUnavailable: true } : {}),
  };
}
