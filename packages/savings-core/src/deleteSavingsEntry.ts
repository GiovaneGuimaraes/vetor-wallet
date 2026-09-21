import type { Db } from '@vetor-wallet/db';

export interface DeleteSavingsEntryParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Apaga um lançamento. Devolve `false` quando nada foi apagado — porque o
 * lançamento não existe **ou** é de outro usuário; a rota traduz os dois casos
 * no mesmo 404, que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteSavingsEntry(params: DeleteSavingsEntryParams): Promise<boolean> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'DELETE FROM savings_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
