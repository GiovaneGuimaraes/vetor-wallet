import type { CategoryBudget, ExpenseEntry, FixedExpense } from '@vetor-wallet/shared';

/**
 * Função pura da seção "Orçamento do mês" da `DespesasPage` (T-023).
 * Extraída para poder ser testada sem DOM, no mesmo padrão de `expenseMonth.ts`.
 */

export interface BudgetProgress {
  id: number;
  category: string;
  /** Teto do orçamento para a categoria. */
  amount: number;
  /** Gasto na categoria no mês exibido: fixas da categoria + lançamentos variáveis do mês. */
  spent: number;
  /** Percentual real, sem clamp — pode passar de 100 (ex.: 140). */
  pct: number;
  /** Percentual limitado a [0, 100], para a largura visual da barra. */
  pctClamped: number;
  /** true quando o gasto atingiu ou ultrapassou o teto (pct >= 100). */
  over: boolean;
}

/**
 * Calcula o progresso de cada orçamento de categoria comparando com o gasto
 * do mês exibido: despesas fixas da mesma categoria (valem para todo mês,
 * sem data) + lançamentos variáveis da categoria já filtrados pelo mês
 * (`entries` vem de `GET /api/expense-entries?month=`).
 */
export function computeBudgetProgress(
  budgets: CategoryBudget[],
  fixedExpenses: FixedExpense[],
  entries: ExpenseEntry[],
): BudgetProgress[] {
  return budgets.map((budget) => {
    const fixedSpent = fixedExpenses
      .filter((expense) => expense.category === budget.category)
      .reduce((acc, expense) => acc + expense.amount, 0);
    const variableSpent = entries
      .filter((entry) => entry.category === budget.category)
      .reduce((acc, entry) => acc + entry.amount, 0);
    const spent = fixedSpent + variableSpent;
    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

    return {
      id: budget.id,
      category: budget.category,
      amount: budget.amount,
      spent,
      pct,
      pctClamped: Math.min(100, Math.max(0, pct)),
      over: pct >= 100,
    };
  });
}
