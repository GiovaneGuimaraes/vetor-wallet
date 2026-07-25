import type { PortfolioSummary, Goal, ExpenseEntry } from '@vetor-wallet/shared';

/**
 * Funções puras de agregação para a Home v4 (T-008). Extraídas de
 * `HomePage.tsx` para serem testáveis isoladamente assim que o pacote `web`
 * tiver um test runner configurado (pendente issue #6, ver CLAUDE.md ›
 * Política de testes). Até lá, cobertas apenas manualmente.
 */

export interface StockTotals {
  invested: number;
  current: number;
  /** true quando ao menos uma carteira não tem cotação disponível (fetchQuotes
   * falhou silenciosamente — ver CLAUDE.md › Falha silenciosa de cotações) e
   * o valor investido foi usado como fallback para o valor atual. */
  hasMissingQuote: boolean;
}

export function computeStockTotals(summaries: PortfolioSummary[]): StockTotals {
  let invested = 0;
  let current = 0;
  let hasMissingQuote = false;

  for (const summary of summaries) {
    invested += summary.totalInvested;
    if (summary.totalCurrentValue === null) {
      // summary.quotesUnavailable (quando presente) confirma que foi uma falha
      // na busca de cotações na brapi — não apenas um ticker sem preço.
      hasMissingQuote = true;
      current += summary.totalInvested;
    } else {
      current += summary.totalCurrentValue;
    }
  }

  return { invested, current, hasMissingQuote };
}

export function sumAmounts(items: Array<{ amount: number }>): number {
  return items.reduce((acc, item) => acc + item.amount, 0);
}

export interface MonthCashFlow {
  /** Total de despesas do mês: fixas + lançamentos variáveis (ou só fixas quando os lançamentos não puderam ser buscados). */
  expensesTotal: number;
  /** Sobra prevista (estimativa estática): renda − despesas fixas. Sempre calculável. */
  estimatedBalance: number;
  /** Sobra real do mês: renda − despesas fixas − lançamentos variáveis do mês corrente.
   * Igual a `estimatedBalance` quando não há lançamentos variáveis (ou quando a busca falhou). */
  realBalance: number;
  /** true quando os lançamentos variáveis do mês foram carregados com sucesso (mesmo que vazios).
   * false quando a busca falhou (`variableEntries === null`) — nesse caso `realBalance` cai para a
   * estimativa antiga (`estimatedBalance`), sinalizado na Home em vez de virar NaN. */
  hasVariableEntries: boolean;
}

/**
 * Fluxo de caixa real do mês corrente (T-025), a partir da renda, das despesas
 * fixas e dos lançamentos de despesas variáveis (T-022) já filtrados pelo mês
 * no server. `variableEntries` é `null` quando a busca desses lançamentos
 * falhou (padrão `Promise.allSettled` da Home) — nesse caso a função cai para
 * o comportamento anterior (sobra estimada = renda − fixas) em vez de NaN.
 */
export function computeMonthCashFlow(
  incomeTotal: number,
  fixedExpensesTotal: number,
  variableEntries: ExpenseEntry[] | null,
): MonthCashFlow {
  const estimatedBalance = incomeTotal - fixedExpensesTotal;

  if (variableEntries === null) {
    return {
      expensesTotal: fixedExpensesTotal,
      estimatedBalance,
      realBalance: estimatedBalance,
      hasVariableEntries: false,
    };
  }

  const variableTotal = sumAmounts(variableEntries);
  const expensesTotal = fixedExpensesTotal + variableTotal;

  return {
    expensesTotal,
    estimatedBalance,
    realBalance: incomeTotal - expensesTotal,
    hasVariableEntries: true,
  };
}

export interface GoalsSummary {
  count: number;
  totalTarget: number;
  totalCurrent: number;
  /** Progresso agregado (0-100), ou null quando não há metas com alvo > 0. */
  aggregatePct: number | null;
}

export function computeGoalsSummary(goals: Goal[]): GoalsSummary {
  const totalTarget = goals.reduce((acc, goal) => acc + goal.target_amount, 0);
  const totalCurrent = goals.reduce((acc, goal) => acc + goal.current_amount, 0);

  return {
    count: goals.length,
    totalTarget,
    totalCurrent,
    // aggregatePct fica null (em vez de dividir por zero) quando não há metas
    // ou quando todas têm target_amount 0 — nesses casos a HomePage cai para
    // exibir a contagem de metas no card em vez de um percentual sem sentido.
    aggregatePct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : null,
  };
}
