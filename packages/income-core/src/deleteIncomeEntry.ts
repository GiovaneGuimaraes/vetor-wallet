import type { Query } from '@vetor-wallet/query';

export interface DeleteIncomeEntryParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga um lançamento de renda. Devolve `false` quando nada foi apagado — não
 * existe **ou** é de outro usuário, os dois traduzidos no mesmo 404 pela rota.
 */
export async function deleteIncomeEntry(params: DeleteIncomeEntryParams): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM income_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
