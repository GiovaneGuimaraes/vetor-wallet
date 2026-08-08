import type { IncomeEntry, IncomeSource } from '@vetor-wallet/shared';

/**
 * Funções puras da visão mensal de renda (T-036) — espelho de
 * `computeMonthTotals` em `expenseMonth.ts`. Os helpers de navegação/rótulo de
 * mês (`currentMonthKey`, `shiftMonth`, `formatMonthLabel`, `formatDayMonth`)
 * NÃO são reimplementados aqui: `RendaPage` importa os de `expenseMonth.ts`,
 * que não são específicos de despesas.
 */

export interface MonthIncomeTotals {
  /** Soma das fontes fixas (`income_sources`) — não dependem do mês exibido. */
  fixed: number;
  /** Soma das rendas variáveis (`income_entries`) já filtradas pelo mês. */
  variable: number;
  total: number;
}

/**
 * Total do mês exibido em `/renda`: fontes fixas (que valem para todo mês, pois
 * não têm data) + rendas variáveis daquele mês, já filtradas no server.
 */
export function computeIncomeMonthTotals(
  sources: IncomeSource[],
  entries: IncomeEntry[]
): MonthIncomeTotals {
  const fixed = sources.reduce((acc, s) => acc + s.amount, 0);
  const variable = entries.reduce((acc, e) => acc + e.amount, 0);
  return { fixed, variable, total: fixed + variable };
}
