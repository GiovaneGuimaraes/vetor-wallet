import type { IncomeSourceType } from '@vetor-wallet/shared';

/**
 * Os tipos de fonte de renda fixa que a API aceita.
 *
 * Vive no core porque é conhecimento de domínio; a rota usa a lista para montar
 * a mensagem de 400. Ordem estável — ela aparece na mensagem de erro.
 */
export const INCOME_SOURCE_TYPES: IncomeSourceType[] = ['SALARIO', 'FREELA', 'OUTRO'];

/** `true` se `value` é um tipo de fonte de renda conhecido. */
export function isIncomeSourceType(value: unknown): value is IncomeSourceType {
  return typeof value === 'string' && (INCOME_SOURCE_TYPES as string[]).includes(value);
}
