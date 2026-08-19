/**
 * Lógica pura do saldo da poupança.
 *
 * Até a T-091b1 este arquivo também derivava o **saldo livre**
 * (`saldo − reservado em metas`, T-041). Metas foi removida do app por decisão
 * do humano (2026-08-14), então não há mais nada a reservar: **o saldo livre da
 * poupança é o saldo inteiro**, e o conceito deixou de ter função própria — quem
 * precisa do número lê o saldo direto (`computeBalance` aqui, ou o `balance` do
 * `SavingsSummary` no cliente).
 *
 * O que a remoção NÃO pode mudar: toda soma de dinheiro continua feita em
 * **centavos inteiros**. Somar floats direto faria `0,10 + 0,20` virar
 * `0.30000000000000004` e um centavo de divergência entre o saldo e o
 * `summary` em razões grandes.
 *
 * Dado legado, depois da etapa 2 (T-091b2, 2026-08-18): `savings_entries.goal_id`
 * **não existe mais** — a coluna foi apagada do banco junto com a tabela `goals`.
 * O que sobrou de Metas é o `transfer_group` (T-041), que amarra as pernas de uma
 * transferência antiga e serve só de procedência para o selo `⇄` da UI. Perna de
 * par legado é um lançamento **comum**: entra no saldo como qualquer outro, sem
 * nenhum desconto.
 */

/** Subconjunto de `SavingsEntry` de que o cálculo depende. */
export interface SavingsBalanceEntry {
  type: 'DEPOSIT' | 'WITHDRAW' | 'YIELD';
  amount: number;
}

/** Converte reais em centavos inteiros, para comparação exata de dinheiro. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Saldo da poupança: DEPOSIT + YIELD − WITHDRAW (mesma conta do `summary`). */
export function computeBalance(entries: SavingsBalanceEntry[]): number {
  let cents = 0;
  for (const entry of entries) {
    if (entry.type === 'WITHDRAW') cents -= toCents(entry.amount);
    else cents += toCents(entry.amount);
  }
  return cents / 100;
}
