import type { Query } from '@vetor-wallet/query';

export interface DeleteAlertRuleParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Apaga uma regra de alerta. Devolve `false` quando nada foi apagado — porque
 * ela não existe **ou** é de outro usuário; a rota traduz os dois casos no
 * mesmo 404, que é o que evita a exclusão virar sonda de existência.
 */
export async function deleteAlertRule(params: DeleteAlertRuleParams): Promise<boolean> {
  const { query, userId, id } = params;
  const result = await query({
    text: 'DELETE FROM alert_rules WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rowCount > 0;
}
