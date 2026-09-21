import type { Db } from '@vetor-wallet/db';

export interface DeleteIncomeEntryParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Apaga um lançamento de renda. Devolve `false` quando nada foi apagado — não
 * existe **ou** é de outro usuário, os dois traduzidos no mesmo 404 pela rota.
 */
export async function deleteIncomeEntry(params: DeleteIncomeEntryParams): Promise<boolean> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'DELETE FROM income_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
