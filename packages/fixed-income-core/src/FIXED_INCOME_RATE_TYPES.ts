import type { FixedIncomeRateType } from '@vetor-wallet/shared';

/**
 * Os indexadores aceitos. O significado de `rate` depende do indexador:
 * `PRE` = % a.a.; `CDI` = % do CDI; `IPCA`/`SELIC` = spread % a.a.
 *
 * A taxa é **informativa**: nada neste package projeta rendimento a partir
 * dela (ver `CLAUDE.md` → "O que este core NÃO faz").
 */
export const FIXED_INCOME_RATE_TYPES: FixedIncomeRateType[] = ['PRE', 'CDI', 'IPCA', 'SELIC'];

/** `true` se `value` é um indexador conhecido (caixa exata). */
export function isFixedIncomeRateType(value: unknown): value is FixedIncomeRateType {
  return typeof value === 'string' && (FIXED_INCOME_RATE_TYPES as string[]).includes(value);
}
