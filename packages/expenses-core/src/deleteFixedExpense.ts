import type { Db } from '@vetor-wallet/db';

export interface DeleteFixedExpenseParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma despesa fixa. Devolve `false` quando nada foi apagado — porque ela
 * não existe **ou** é de outro usuário; a rota traduz os dois casos no mesmo
 * 404, que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteFixedExpense(params: DeleteFixedExpenseParams): Promise<boolean> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'DELETE FROM fixed_expenses WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
