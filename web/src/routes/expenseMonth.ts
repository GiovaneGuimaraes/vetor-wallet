import type { ExpenseEntry, FixedExpense } from '@vetor-wallet/shared';

/**
 * Funções puras da visão mensal de despesas (T-022): navegação de mês,
 * rótulo em pt-BR e total do mês = despesas fixas + lançamentos variáveis.
 * Extraídas de `DespesasPage` para poderem ser testadas sem DOM.
 */

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Mês corrente como `YYYY-MM` no fuso local (não em UTC). */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Desloca um mês `YYYY-MM` em `delta` meses, virando o ano quando necessário.
 * Retorna o próprio input se ele não for um `YYYY-MM` válido.
 */
export function shiftMonth(monthKey: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthKey;

  const total = year * 12 + monthIndex + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth + 1).padStart(2, '0')}`;
}

/** Rótulo legível de um `YYYY-MM` — ex.: `2026-07` → `julho de 2026`. */
export function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const name = MONTH_NAMES[Number(match[2]) - 1];
  if (!name) return monthKey;
  return `${name} de ${match[1]}`;
}

/** `2026-07-10` → `10/07`. Datas fora do formato voltam inalteradas. */
export function formatDayMonth(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}`;
}

export interface MonthExpenseTotals {
  fixed: number;
  variable: number;
  total: number;
}

/**
 * Total do mês exibido: despesas fixas (que valem para todo mês, pois não têm
 * data) + lançamentos variáveis já filtrados pelo mês no server.
 */
export function computeMonthTotals(
  fixedExpenses: FixedExpense[],
  entries: ExpenseEntry[],
): MonthExpenseTotals {
  const fixed = fixedExpenses.reduce((acc, e) => acc + e.amount, 0);
  const variable = entries.reduce((acc, e) => acc + e.amount, 0);
  return { fixed, variable, total: fixed + variable };
}
