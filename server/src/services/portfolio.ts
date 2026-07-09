import type { Operation, Position, PortfolioSummary } from '@vetor-wallet/shared';

export interface PositionEntry {
  quantity: number;
  avgPrice: number;
}

export function buildPositionMap(ops: Operation[]): Map<string, PositionEntry> {
  const positionMap = new Map<string, PositionEntry>();

  for (const op of ops) {
    const current = positionMap.get(op.ticker) ?? { quantity: 0, avgPrice: 0 };

    if (op.type === 'BUY') {
      const totalCost = current.quantity * current.avgPrice + op.quantity * op.price;
      const newQty = current.quantity + op.quantity;
      positionMap.set(op.ticker, {
        quantity: newQty,
        avgPrice: newQty > 0 ? totalCost / newQty : 0,
      });
    } else {
      const newQty = current.quantity - op.quantity;
      positionMap.set(op.ticker, {
        quantity: Math.max(0, newQty),
        avgPrice: current.avgPrice,
      });
    }
  }

  return positionMap;
}

export function buildPortfolioSummary(
  positionMap: Map<string, PositionEntry>,
  quotes: Map<string, number>,
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
    totalProfitLoss !== null && totalInvested > 0
      ? (totalProfitLoss / totalInvested) * 100
      : null;

  return { positions, totalInvested, totalCurrentValue, totalProfitLoss, totalProfitLossPct };
}
