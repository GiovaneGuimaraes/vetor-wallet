import type { FixedIncomeKind } from '@vetor-wallet/shared';

/**
 * Os tipos de aplicação de Renda Fixa, no vocabulário aprovado pelo humano
 * (T-091c/d). Ordem estável — aparece na mensagem de 400 da rota.
 *
 * Esta lista, o `CHECK(kind IN ...)` de `packages/db/src/schema.ts` e o `ENUM`
 * de `packages/postgresdb/src/models/FixedIncomePosition.ts` mudam juntos.
 */
export const FIXED_INCOME_KINDS: FixedIncomeKind[] = [
  'CAIXINHA',
  'CDB',
  'LCI',
  'LCA',
  'TESOURO',
  'DEBENTURE',
  'CRI_CRA',
  'OUTRO',
];

/** `true` se `value` é um `kind` conhecido (caixa exata). */
export function isFixedIncomeKind(value: unknown): value is FixedIncomeKind {
  return typeof value === 'string' && (FIXED_INCOME_KINDS as string[]).includes(value);
}
