import type { Db } from '@vetor-wallet/db';
import type { FixedExpense } from '@vetor-wallet/shared';

export interface ListFixedExpensesParams {
  db: Db;
  userId: number;
}

/** As despesas fixas de UM usuário, da mais recente para a mais antiga. */
export async function listFixedExpenses(params: ListFixedExpensesParams): Promise<FixedExpense[]> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM fixed_expenses WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  return result.rows as unknown as FixedExpense[];
}
