import { getPositionQuantity } from './getPositionQuantity';
import type { PositionEntry } from './types';

/**
 * `true` quando vender `sellQuantity` de `ticker` passaria da posição atual —
 * é a validação de SELL de `POST /api/operations` e do import CSV. Vender
 * exatamente a posição inteira é permitido.
 */
export function wouldExceedPosition(
  positionMap: Map<string, PositionEntry>,
  ticker: string,
  sellQuantity: number
): boolean {
  return sellQuantity > getPositionQuantity(positionMap, ticker);
}
