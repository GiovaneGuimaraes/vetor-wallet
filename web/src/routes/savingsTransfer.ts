/**
 * Helpers puros da transferência poupança → meta (T-041).
 *
 * O server é a autoridade sobre o saldo livre (`server/src/services/savings.ts`),
 * mas o cliente precisa do mesmo número para exibir o card "Saldo livre" e para
 * barrar o valor antes de gastar um request. A duplicação é intencional e segue
 * o padrão já adotado em `normalizeCategory` (T-028): `shared/` é types-only por
 * construção, então função de runtime não pode morar lá — **as duas cópias devem
 * mudar juntas**.
 *
 * Toda comparação de dinheiro é em centavos inteiros: um saldo livre somado de
 * 0,10 + 0,20 vale 0,30, e comparar floats rejeitaria transferir exatamente ele.
 */

import type { SavingsEntry } from '@vetor-wallet/shared';
import { parseMoneyInput } from './inlineEdit';

/** Converte reais em centavos inteiros, para comparação exata de dinheiro. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Reservado por meta: DEPOSIT − WITHDRAW dos lançamentos vinculados, com piso 0
 * por meta (espelha `resolveGoalProgress` no server — uma meta "no negativo" não
 * empresta reserva para as outras). `YIELD` nunca entra: não pode ser vinculado
 * (T-024) e, portanto, rendimento é sempre dinheiro livre.
 */
export function computeReservedByGoal(entries: SavingsEntry[]): Map<number, number> {
  const cents = new Map<number, number>();
  for (const entry of entries) {
    if (entry.goal_id == null) continue;
    if (entry.type !== 'DEPOSIT' && entry.type !== 'WITHDRAW') continue;
    const delta = entry.type === 'DEPOSIT' ? toCents(entry.amount) : -toCents(entry.amount);
    cents.set(entry.goal_id, (cents.get(entry.goal_id) ?? 0) + delta);
  }

  const reserved = new Map<number, number>();
  for (const [goalId, value] of cents) reserved.set(goalId, Math.max(0, value) / 100);
  return reserved;
}

/** Total reservado em metas — soma de `computeReservedByGoal`. */
export function computeReservedTotal(entries: SavingsEntry[]): number {
  let cents = 0;
  for (const value of computeReservedByGoal(entries).values()) cents += toCents(value);
  return cents / 100;
}

/**
 * Saldo livre = saldo − reservado em metas.
 *
 * O `balance` vem do `summary` do server (fonte única do saldo); só a parcela
 * reservada é derivada dos `entries` que a tela já tem. Pode ser **negativo** em
 * bases legadas (aportes vinculados anteriores à T-041 somando mais que o saldo)
 * — quem exibe aplica `max(0, …)`, e `validateTransfer` rejeita tudo nesse caso.
 */
export function computeFreeBalance(balance: number, entries: SavingsEntry[]): number {
  return (toCents(balance) - toCents(computeReservedTotal(entries))) / 100;
}

/**
 * Valida o form de transferência antes do request. Devolve a mensagem de erro
 * em pt-BR ou `null` quando está tudo certo.
 *
 * `amountRaw` é o texto do input (aceita vírgula decimal, via `parseMoneyInput`
 * — mesma regra dos demais forms de dinheiro); `goalIdRaw` é o valor do
 * `<select>` (`''` = nenhuma meta escolhida).
 */
export function validateTransfer(
  amountRaw: string,
  goalIdRaw: string,
  freeBalance: number,
): string | null {
  if (!goalIdRaw) return 'Escolha a meta que vai receber o valor.';

  const amount = parseMoneyInput(amountRaw);
  if (amount === null) return 'Informe um valor válido, maior que zero.';

  if (toCents(amount) > toCents(freeBalance)) {
    return 'Valor acima do saldo livre da poupança (o restante já está reservado em metas).';
  }
  return null;
}

/**
 * `true` quando o lançamento é uma das pernas de uma transferência (T-041) —
 * usado só para o selo `⇄` na lista, no espírito do `↻ recorrente` da T-035.
 */
export function isTransferLeg(entry: SavingsEntry): boolean {
  return typeof entry.transfer_group === 'string' && entry.transfer_group.length > 0;
}
