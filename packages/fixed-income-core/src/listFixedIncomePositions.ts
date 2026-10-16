import type { Query } from '@vetor-wallet/query';
import type { FixedIncomePosition } from '@vetor-wallet/shared';

export interface ListFixedIncomePositionsParams {
  query: Query;
  userId: number;
}

/**
 * As posições de Renda Fixa de UM usuário, da aplicação mais recente para a
 * mais antiga (o `id` desempata duas aplicações no mesmo dia).
 *
 * **Sempre filtrada por `user_id`** — não existe leitura "todas as posições".
 */
export async function listFixedIncomePositions(
  params: ListFixedIncomePositionsParams
): Promise<FixedIncomePosition[]> {
  const { query, userId } = params;
  const result = await query<FixedIncomePosition>({
    text: 'SELECT * FROM fixed_income_positions WHERE user_id = $1 ORDER BY invested_at DESC, id DESC',
    values: [userId],
  });
  return result.rows;
}
