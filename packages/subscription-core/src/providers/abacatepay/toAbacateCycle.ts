import type { PlanInterval } from '@vetor-wallet/shared';

/** Ciclo de cobrança de um produto recorrente na AbacatePay. */
export type AbacateCycle = 'MONTHLY' | 'ANNUALLY';

const CYCLES: Record<PlanInterval, AbacateCycle> = {
  monthly: 'MONTHLY',
  yearly: 'ANNUALLY',
};

/**
 * Traduz o `interval` do nosso plano para o `cycle` do produto no provedor.
 *
 * Lança em vez de devolver `undefined` para um valor fora do tipo (o
 * `interval` vem do banco): `undefined` some do JSON, e um produto criado sem
 * ciclo cobraria de um jeito que ninguém escolheu.
 */
export const toAbacateCycle = (interval: PlanInterval): AbacateCycle => {
  const cycle = CYCLES[interval];
  if (cycle === undefined) {
    throw new Error(`Intervalo de plano sem ciclo na AbacatePay: ${String(interval)}`);
  }
  return cycle;
};
