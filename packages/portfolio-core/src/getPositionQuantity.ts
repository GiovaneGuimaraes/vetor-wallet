import type { PositionEntry } from './types';

/** Quantidade detida de `ticker`; ticker sem posição conta como 0. */
export function getPositionQuantity(
  positionMap: Map<string, PositionEntry>,
  ticker: string
): number {
  return positionMap.get(ticker)?.quantity ?? 0;
}
