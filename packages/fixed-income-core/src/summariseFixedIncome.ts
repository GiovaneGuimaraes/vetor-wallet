import type { FixedIncomePosition, FixedIncomeSummary } from '@vetor-wallet/shared';
import { toCents } from './toCents';

/** Subconjunto de `FixedIncomePosition` de que o resumo depende. */
export type FixedIncomeSummaryInput = Pick<
  FixedIncomePosition,
  'invested_amount' | 'current_value'
>;

/**
 * O `summary` de `GET /api/fixed-income`: total aplicado e total atual.
 *
 * "Atual" de uma posição é `current_value ?? invested_amount` — o saldo que o
 * usuário informou, ou, sem ele, o próprio valor aplicado. **Nunca** uma
 * estimativa por taxa (decisão do humano, T-091c/d).
 *
 * Somado em centavos inteiros e devolvido em reais, como o `summariseSavings`:
 * o resto da API fala reais, e somar em float direto pode divergir um centavo.
 */
export function summariseFixedIncome(positions: FixedIncomeSummaryInput[]): FixedIncomeSummary {
  let investedCents = 0;
  let currentCents = 0;
  for (const position of positions) {
    investedCents += toCents(position.invested_amount);
    currentCents += toCents(position.current_value ?? position.invested_amount);
  }
  return { totalInvested: investedCents / 100, totalCurrent: currentCents / 100 };
}
