import type {
  PortfolioSummary,
  Goal,
  ExpenseEntry,
  IncomeEntry,
  IncomeSource,
  FixedExpense,
  SavingsSummary,
} from '@vetor-wallet/shared';

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
  variableIncomeEntries: IncomeEntry[] | null
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

/**
 * Predicados "layer vazio" para o onboarding da Home (T-080): quando true, o
 * card mostra um CTA curto no lugar do valor zerado, indicando por onde
 * começar. Todos se baseiam na EXISTÊNCIA de registros, não na soma dos
 * valores — um usuário com lançamentos que somam R$ 0,00 tem dados e não deve
 * ver o CTA.
 *
 * Quando uma fonte é `null` (busca do mês ainda não resolveu ou falhou — ver
 * `Promise.allSettled` em HomePage), o estado é "desconhecido": os predicados
 * preferem não afirmar "vazio" para não sugerir uma ação que já foi feita
 * (falso positivo é pior que o CTA sumir um instante depois que os dados
 * chegam).
 */

/** Renda (T-080): vazio quando não há fontes fixas E as rendas variáveis do
 * mês corrente foram carregadas (não `null`) e vieram vazias. */
export function isIncomeLayerEmpty(
  income: IncomeSource[],
  variableIncomeEntries: IncomeEntry[] | null
): boolean {
  return (
    income.length === 0 && variableIncomeEntries !== null && variableIncomeEntries.length === 0
  );
}

/** Despesas (T-080): mesmo critério da renda, para despesas fixas + lançamentos variáveis do mês. */
export function isExpensesLayerEmpty(
  expenses: FixedExpense[],
  variableEntries: ExpenseEntry[] | null
): boolean {
  return expenses.length === 0 && variableEntries !== null && variableEntries.length === 0;
}

/**
 * Poupança (T-080): a Home só recebe o agregado `SavingsSummary` (sem a lista
 * de movimentações), então não há como checar "existe registro" diretamente.
 * Critério adotado: as três somas de movimentação (depósitos, rendimentos,
 * saques) zeradas — o `balance` sozinho não bastaria (um saque zeraria o
 * saldo sem esvaziar o histórico). Três somas zeradas só ocorre com zero
 * lançamentos, já que qualquer DEPOSIT/YIELD/WITHDRAW soma um valor > 0 em
 * algum dos três. `null` (ainda não carregou ou falhou) não é tratado como
 * vazio.
 */
export function isSavingsLayerEmpty(summary: SavingsSummary | null): boolean {
  if (!summary) return false;
  return summary.totalDeposits === 0 && summary.totalYield === 0 && summary.totalWithdrawals === 0;
}

/**
 * Ações (T-080): vazio quando a carteira consolidada JÁ carregou com sucesso
 * (`walletLoaded && !walletLoadError` — mesmo gate usado por DashboardPage.tsx
 * para `walletSummary`) e ela não tem nenhuma posição.
 *
 * `walletSummary` vem do `ShellContext` e fica `null` tanto "ainda não
 * carregou" quanto "getPortfolio() falhou e o catch não seta nada" (ver
 * App.tsx). Sem o gate por `walletLoaded`/`walletLoadError`, uma falha
 * transitória na busca da carteira (ex.: brapi fora do ar) faria o card
 * mostrar o CTA de onboarding por cima de posições reais do usuário — um
 * falso positivo pior do que simplesmente não mostrar o CTA.
 */
export function isStocksLayerEmpty(
  walletSummary: PortfolioSummary | null,
  walletLoaded: boolean,
  walletLoadError: boolean
): boolean {
  if (!walletLoaded || walletLoadError) return false;
  return walletSummary === null || walletSummary.positions.length === 0;
}

/** Metas (T-080): vazio quando não há nenhuma meta cadastrada. */
export function isGoalsLayerEmpty(goals: Goal[]): boolean {
  return goals.length === 0;
}
