import type { Operation } from '@vetor-wallet/shared';
import { applyOperation } from './applyOperation';
import type { PositionEntry } from './types';

/**
 * Posição por ticker depois de aplicar `ops` em ordem. A ordem importa (uma
 * SELL antes da BUY que a cobre distorceria a média): o chamador passa as
 * operações já ordenadas por `date ASC, created_at ASC`.
 */
export function buildPositionMap(ops: Operation[]): Map<string, PositionEntry> {
  const positionMap = new Map<string, PositionEntry>();
  for (const op of ops) applyOperation(positionMap, op);
  return positionMap;
}
