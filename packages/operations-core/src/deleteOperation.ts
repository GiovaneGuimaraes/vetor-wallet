import type { Db } from '@vetor-wallet/db';

export interface DeleteOperationParams {
  db: Db;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma operação. Devolve `false` quando nada foi apagado — porque ela não
 * existe **ou** é de outro usuário; a rota traduz os dois casos no mesmo 404,
 * que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteOperation(params: DeleteOperationParams): Promise<boolean> {
  const { db, userId, id } = params;
  const result = await db.execute({
    sql: 'DELETE FROM operations WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}
