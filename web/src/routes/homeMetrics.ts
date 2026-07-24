import type { PortfolioSummary, Goal } from '@vetor-wallet/shared';

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
    aggregatePct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : null,
  };
}
