import type { Db } from '@vetor-wallet/db';

export interface DeleteIncomeSourceParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma fonte de renda. Devolve `false` quando nada foi apagado — porque
 * ela não existe **ou** é de outro usuário; a rota traduz os dois casos no
 * mesmo 404, que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteIncomeSource(params: DeleteIncomeSourceParams): Promise<boolean> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'DELETE FROM income_sources WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
