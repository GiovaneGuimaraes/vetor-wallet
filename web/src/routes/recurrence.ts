import type { ExpenseEntry, RecurringExpense } from '@vetor-wallet/shared';

/**
 * Helpers puros da recorrência mensal de despesas (T-035), fora do componente
 * para poderem ser testados sem DOM (política de testes do CLAUDE.md).
 */

/**
 * Rótulo do dia de uma recorrência. Dias 29-31 ganham a ressalva de que meses
 * curtos usam o último dia — é o ajuste que o server faz ao materializar
 * (`occurrenceDate` em `server/src/services/recurringExpenses.ts`), e sem o
 * aviso o usuário estranharia uma ocorrência em 28/02 de uma recorrência "31".
 */
export function formatRecurrenceDay(dayOfMonth: number): string {
  if (!Number.isFinite(dayOfMonth)) return 'todo mês';
  const day = Math.min(Math.max(1, Math.trunc(dayOfMonth)), 31);
  if (day >= 29) return `todo dia ${day} (ou no último dia, em meses curtos)`;
  return `todo dia ${day}`;
}

/**
 * Mês em que a recorrência vai efetivamente começar, espelhando a regra do
 * server (`POST /api/expense-entries`): o piso é o mês de **criação**, e a data
 * do lançamento só manda quando é futura. Serve para avisar o usuário quando
 * ele marca "repetir todo mês" num lançamento com data passada — nesse caso
 * nada é gerado nos meses já fechados.
 */
export function recurrenceStartMonth(entryMonth: string, currentMonth: string): string {
  return entryMonth > currentMonth ? entryMonth : currentMonth;
}

/** `true` quando o mês de início não é o mês do lançamento (data passada). */
export function startsLaterThanEntry(entryMonth: string, currentMonth: string): boolean {
  return recurrenceStartMonth(entryMonth, currentMonth) !== entryMonth;
}

/**
 * `true` quando o lançamento foi gerado por uma recorrência — usado para o selo
 * "recorrente" na lista. Um lançamento digitado à mão tem `recurring_id` nulo;
 * campos ausentes (respostas legadas, antes da coluna existir) contam como não
 * recorrentes em vez de quebrar a lista.
 */
export function isRecurringOccurrence(entry: Pick<ExpenseEntry, 'recurring_id'>): boolean {
  return entry.recurring_id !== null && entry.recurring_id !== undefined;
}

/**
 * Recorrências ativas ordenadas para exibição: maior valor primeiro (o que mais
 * pesa no mês aparece no topo), desempatando por descrição para a ordem ser
 * estável entre renders. A rota já devolve só as ativas, mas o filtro repetido
 * aqui protege o estado otimista da página de mostrar uma encerrada.
 */
export function activeRecurrences(recurrences: RecurringExpense[]): RecurringExpense[] {
  return recurrences
    .filter((r) => r.active === 1)
    .sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description, 'pt-BR'));
}

/** Soma mensal comprometida com recorrências ativas. */
export function totalRecurring(recurrences: RecurringExpense[]): number {
  return activeRecurrences(recurrences).reduce((sum, r) => sum + r.amount, 0);
}
