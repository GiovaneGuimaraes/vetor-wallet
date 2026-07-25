import type { PortfolioSummary, Goal, ExpenseEntry, IncomeEntry } from '@vetor-wallet/shared';

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
  /** Total de renda do mês: fontes fixas + rendas variáveis do mês (T-036), ou só as
   * fixas quando as rendas variáveis não puderam ser buscadas. É o valor exibido no
   * card "Renda" da Home. */
  incomeTotal: number;
  /** Total de despesas do mês: fixas + lançamentos variáveis (ou só fixas quando os lançamentos não puderam ser buscados). */
  expensesTotal: number;
  /** Sobra prevista (estimativa estática): renda FIXA − despesas fixas. Sempre calculável.
   * Não inclui rendas variáveis: o que é avulso não é previsível. */
  estimatedBalance: number;
  /** Sobra real do mês: (renda fixa + rendas variáveis do mês) − despesas fixas −
   * lançamentos variáveis do mês corrente. Igual a `estimatedBalance` quando não há
   * nenhum lançamento variável dos dois lados (ou quando as buscas falharam). */
  realBalance: number;
  /** true quando os lançamentos variáveis do mês foram carregados com sucesso (mesmo que vazios,
   * i.e. array []). false quando a busca falhou (`variableEntries === null`) — nesse caso
   * `realBalance` cai para a estimativa antiga (`estimatedBalance`), sinalizado na Home em vez de
   * virar NaN. Renomeado de `hasVariableEntries` (T-030): o nome antigo mentia — também dava
   * `true` para um mês sem nenhum lançamento (array vazio), que é um estado de sucesso, não de
   * falha; `entriesLoaded` deixa essa distinção explícita para quem consome o campo. */
  entriesLoaded: boolean;
  /** Simetria de `entriesLoaded` para as rendas variáveis do mês (T-036): true quando
   * `variableIncomeEntries` foi carregado com sucesso (inclusive vazio); false quando a
   * busca falhou (`null`) — nesse caso `incomeTotal` fica só com as fontes fixas, em vez
   * de virar NaN, e a Home sinaliza que o valor é parcial. */
  incomeEntriesLoaded: boolean;
}

/**
 * Fluxo de caixa real do mês corrente (T-025), a partir da renda fixa, das
 * despesas fixas, dos lançamentos de despesas variáveis (T-022) e das rendas
 * variáveis do mês (T-036) — os dois últimos já filtrados pelo mês no server.
 *
 * `variableEntries`/`variableIncomeEntries` são `null` quando a busca
 * correspondente falhou (padrão `Promise.allSettled` da Home): cada lado cai
 * independentemente para "sem lançamentos" (0) em vez de NaN, com a respectiva
 * flag de load em false. Com `variableIncomeEntries` vazio ou `null`, todos os
 * números são idênticos ao comportamento pré-T-036.
 */
export function computeMonthCashFlow(
  fixedIncomeTotal: number,
  fixedExpensesTotal: number,
  variableEntries: ExpenseEntry[] | null,
  variableIncomeEntries: IncomeEntry[] | null,
): MonthCashFlow {
  // A sobra PREVISTA continua sendo só o que se repete todo mês: renda fixa −
  // despesas fixas. Renda avulsa entra apenas na sobra REAL.
  const estimatedBalance = fixedIncomeTotal - fixedExpensesTotal;

  const incomeEntriesLoaded = variableIncomeEntries !== null;
  const variableIncomeTotal = incomeEntriesLoaded ? sumAmounts(variableIncomeEntries) : 0;
  const incomeTotal = fixedIncomeTotal + variableIncomeTotal;

  const entriesLoaded = variableEntries !== null;
  const variableExpensesTotal = entriesLoaded ? sumAmounts(variableEntries) : 0;
  const expensesTotal = fixedExpensesTotal + variableExpensesTotal;

  return {
    incomeTotal,
    expensesTotal,
    estimatedBalance,
    realBalance: incomeTotal - expensesTotal,
    entriesLoaded,
    incomeEntriesLoaded,
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
