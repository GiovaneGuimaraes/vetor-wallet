import type { Query } from '@vetor-wallet/query';

export interface DeleteSavingsEntryParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga um lançamento. Devolve `false` quando nada foi apagado — porque o
 * lançamento não existe **ou** é de outro usuário; a rota traduz os dois casos
 * no mesmo 404, que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteSavingsEntry(params: DeleteSavingsEntryParams): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM savings_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
