import type { Operation, Position, PortfolioSummary } from '@vetor-wallet/shared';

export interface PositionEntry {
  quantity: number;
  avgPrice: number;
}

export function applyOperation(
  positionMap: Map<string, PositionEntry>,
  op: Pick<Operation, 'ticker' | 'type' | 'quantity' | 'price'>
): PositionEntry {
  const current = positionMap.get(op.ticker) ?? { quantity: 0, avgPrice: 0 };
  let updated: PositionEntry;

  if (op.type === 'BUY') {
    const totalCost = current.quantity * current.avgPrice + op.quantity * op.price;
    const newQty = current.quantity + op.quantity;
    updated = { quantity: newQty, avgPrice: newQty > 0 ? totalCost / newQty : 0 };
  } else {
    const newQty = current.quantity - op.quantity;
    updated = { quantity: Math.max(0, newQty), avgPrice: current.avgPrice };
  }

  positionMap.set(op.ticker, updated);
  return updated;
}

export function buildPositionMap(ops: Operation[]): Map<string, PositionEntry> {
  const positionMap = new Map<string, PositionEntry>();
  for (const op of ops) applyOperation(positionMap, op);
  return positionMap;
}

export function getPositionQuantity(
  positionMap: Map<string, PositionEntry>,
  ticker: string
): number {
  return positionMap.get(ticker)?.quantity ?? 0;
}

export function wouldExceedPosition(
  positionMap: Map<string, PositionEntry>,
  ticker: string,
  sellQuantity: number
): boolean {
  return sellQuantity > getPositionQuantity(positionMap, ticker);
}

/**
 * Computes the portfolio's day P&L (variação frente ao fechamento anterior).
 *
 * Only tickers with a positive current position count. Returns null fields when:
 * - the quotes fetch failed, or
 * - there are no active tickers, or
 * - any active ticker is missing either a current quote or a previous-close
 *   snapshot (T-016: "sem snapshot → campo null").
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
