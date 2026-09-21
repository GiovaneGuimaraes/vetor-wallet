import { toCents } from './toCents';

/** Subconjunto de `SavingsEntry` de que o cálculo depende. */
export interface SavingsBalanceEntry {
  type: 'DEPOSIT' | 'WITHDRAW' | 'YIELD';
  amount: number;
}

/**
 * Saldo da poupança: DEPOSIT + YIELD − WITHDRAW, somado em centavos inteiros.
 *
 * Até a T-091b1 este módulo também derivava o **saldo livre**
 * (`saldo − reservado em metas`, T-041). Metas foi removida do app por decisão
 * do humano (2026-08-14), então não há mais nada a reservar: **o saldo livre da
 * poupança é o saldo inteiro**, e quem precisa do número lê o saldo direto.
 *
 * Dado legado, depois da T-091b2 (2026-08-18): `savings_entries.goal_id` **não
 * existe mais**. O que sobrou de Metas é o `transfer_group` (T-041), que amarra
 * as pernas de uma transferência antiga e serve só de procedência para o selo
 * `⇄` da UI. Perna de par legado é um lançamento **comum**: entra no saldo como
 * qualquer outro, sem nenhum desconto.
 */
export function computeBalance(entries: SavingsBalanceEntry[]): number {
  let cents = 0;
  for (const entry of entries) {
    if (entry.type === 'WITHDRAW') cents -= toCents(entry.amount);
    else cents += toCents(entry.amount);
  }
  return cents / 100;
}
