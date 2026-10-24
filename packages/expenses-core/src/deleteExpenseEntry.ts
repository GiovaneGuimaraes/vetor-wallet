import type { Query } from '@vetor-wallet/query';

export interface DeleteExpenseEntryParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga um lançamento de despesa variável. `false` = não existe **ou** é de
 * outro usuário; a rota traduz os dois no mesmo 404 — distinguir transformaria
 * a rota em sonda de existência.
 *
 * Apagar uma **ocorrência** de recorrência não a recria (T-035): o controle do
 * que já foi gerado vive em `recurring_expense_months`, não num índice único
 * sobre esta tabela. Já um lançamento **importado** volta na próxima
 * sincronização — o DELETE libera a chave `external_id` (T-084, assimetria
 * intencional).
 */
export async function deleteExpenseEntry(params: DeleteExpenseEntryParams): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM expense_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
