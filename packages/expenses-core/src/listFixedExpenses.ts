import type { Query } from '@vetor-wallet/query';
import type { FixedExpense } from '@vetor-wallet/shared';

export interface ListFixedExpensesParams {
  query: Query;
  userId: number;
}

/** As despesas fixas de UM usuário, da mais recente para a mais antiga. */
export async function listFixedExpenses(params: ListFixedExpensesParams): Promise<FixedExpense[]> {
  const { query, userId } = params;
  const result = await query<FixedExpense>({
    text: 'SELECT * FROM fixed_expenses WHERE user_id = $1 ORDER BY created_at DESC',
    values: [userId],
  });
  return result.rows;
}
