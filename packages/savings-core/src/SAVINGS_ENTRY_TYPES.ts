import type { SavingsEntryType } from '@vetor-wallet/shared';

/**
 * Os tipos de lançamento que a poupança aceita.
 *
 * Vive no core, e não na rota, porque é conhecimento de domínio: a rota usa a
 * lista para montar a mensagem de 400, mas quem define o que é um lançamento
 * válido é o domínio. Ordem estável — ela aparece na mensagem de erro.
 */
export const SAVINGS_ENTRY_TYPES: SavingsEntryType[] = ['DEPOSIT', 'WITHDRAW', 'YIELD'];

/** `true` se `value` é um tipo de lançamento conhecido. */
export function isSavingsEntryType(value: unknown): value is SavingsEntryType {
  return typeof value === 'string' && (SAVINGS_ENTRY_TYPES as string[]).includes(value);
}
