import type { ExpenseEntry, ExpenseMonthSummaryItem, FixedExpense } from '@vetor-wallet/shared';

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
  entries: ExpenseEntry[]
): MonthExpenseTotals {
  const fixed = fixedExpenses.reduce((acc, e) => acc + e.amount, 0);
  const variable = entries.reduce((acc, e) => acc + e.amount, 0);
  return { fixed, variable, total: fixed + variable };
}

/** Uma linha da seção "Últimos meses" (T-033) — histórico sem gráfico. */
export interface MonthHistoryRow {
  /** YYYY-MM */
  month: string;
  label: string;
  fixed: number;
  variable: number;
  total: number;
  isCurrent: boolean;
}

/**
 * Monta as `monthsCount` linhas do histórico mensal terminando no mês
 * `todayMonthKey` (mais antigo primeiro, mês corrente por último), juntando
 * o total de fixas vigente HOJE (`fixedTotal` — não há histórico de fixas,
 * ver CLAUDE.md "Despesas fixas × lançamentos variáveis") com o total
 * variável de `GET /api/expense-entries/summary`. Meses ausentes na resposta
 * do endpoint (sem lançamentos) entram com variável = 0 — a UI sempre exibe
 * os `monthsCount` meses pedidos, mesmo que o server só devolva os que têm
 * dado.
 */
export function buildMonthlyHistory(
  monthsCount: number,
  todayMonthKey: string,
  summary: ExpenseMonthSummaryItem[],
  fixedTotal: number
): MonthHistoryRow[] {
  const variableByMonth = new Map(summary.map((item) => [item.month, item.total]));
  const rows: MonthHistoryRow[] = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const month = shiftMonth(todayMonthKey, -i);
    const variable = variableByMonth.get(month) ?? 0;
    rows.push({
      month,
      label: formatMonthLabel(month),
      fixed: fixedTotal,
      variable,
      total: fixedTotal + variable,
      isCurrent: month === todayMonthKey,
    });
  }
  return rows;
}
