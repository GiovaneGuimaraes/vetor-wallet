import type { Db } from '@vetor-wallet/db';
import type { ExpenseEntry } from '@vetor-wallet/shared';

export interface GetExpenseEntryParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Um lançamento de despesa pelo id, **sempre** filtrado por `user_id` (T-059).
 *
 * Existe para o re-SELECT do POST recorrente: `createRecurringExpenseEntry`
 * devolve só o `entryId` da transação, e a rota precisa do registro inteiro no
 * corpo do 201. Ler de volta só pelo id funcionaria na prática (ele acabou de
 * nascer), mas a regra do app é que toda consulta carregue o usuário na
 * cláusula.
 *
 * Ausência é `null`, nunca exceção.
 */
export async function getExpenseEntry(params: GetExpenseEntryParams): Promise<ExpenseEntry | null> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM expense_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return (result.rows[0] as unknown as ExpenseEntry) ?? null;
}
