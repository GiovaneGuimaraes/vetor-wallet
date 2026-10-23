import type { Query } from '@vetor-wallet/query';

export interface DeleteOperationParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma operação. Devolve `false` quando nada foi apagado — porque ela não
 * existe **ou** é de outro usuário; a rota traduz os dois casos no mesmo 404,
 * que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteOperation(params: DeleteOperationParams): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM operations WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
