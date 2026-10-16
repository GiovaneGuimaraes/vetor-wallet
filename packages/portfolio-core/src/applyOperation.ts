import type { Operation } from '@vetor-wallet/shared';
import type { PositionEntry } from './types';

/**
 * Aplica UMA operação ao `positionMap` (mutando-o) e devolve a posição nova do
 * ticker. É a ÚNICA implementação da regra de **preço médio ponderado** —
 * `buildPositionMap`, `buildPortfolioHistory` e a validação de SELL passam
 * todos por aqui; nunca duplique a fórmula.
 *
 * - BUY recalcula a média: `(qtd × média + qtd_nova × preço) / qtd_total`.
 * - SELL reduz a quantidade **sem** mexer no preço médio. O piso em zero é
 *   defensivo: as rotas recusam a venda acima da posição antes de chegar aqui.
 */
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
