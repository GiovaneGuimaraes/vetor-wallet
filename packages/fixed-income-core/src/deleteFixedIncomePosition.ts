import type { Query } from '@vetor-wallet/query';

export interface DeleteFixedIncomePositionParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma posição. `false` quando nada foi apagado — porque ela não existe
 * **ou** é de outro usuário; a rota responde 404 aos dois, para a exclusão não
 * virar sonda de existência.
 */
export async function deleteFixedIncomePosition(
  params: DeleteFixedIncomePositionParams
): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM fixed_income_positions WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
